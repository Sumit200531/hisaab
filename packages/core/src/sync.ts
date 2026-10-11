import { openOp, sealOp, type Envelope, type ShopKeys } from './crypto.js';
import type { Ledger, VersionVector } from './ledger.js';

/**
 * Client side of the relay protocol. Two calls per sync:
 *   1. pull: send our version vector, receive what we lack (+ the relay's own vector)
 *   2. push: send what the relay lacks, computed from its vector
 * Both are idempotent, so a sync interrupted by a dropped 2G connection can simply
 * be retried; nothing is lost or applied twice.
 */
export interface Transport {
  pull(shopId: string, token: string, vv: VersionVector, limit: number): Promise<{ ops: Envelope[]; more: boolean; vv: VersionVector }>;
  push(shopId: string, token: string, ops: Envelope[]): Promise<{ stored: number; quota?: boolean }>;
}

/** `full` means the relay refused part of the push because the shop reached its storage quota. */
export interface SyncResult { pulled: number; pushed: number; rejected: number; rounds: number; full: boolean }

export const PUSH_BATCH = 200;
export const PULL_LIMIT = 500;

export async function syncLedger(ledger: Ledger, keys: ShopKeys, t: Transport, maxRounds = 50): Promise<SyncResult> {
  let pulled = 0, pushed = 0, rejected = 0, rounds = 0, full = false;
  let relayVV: VersionVector = {};
  // 1. pull until the relay has nothing more for us
  for (;;) {
    if (++rounds > maxRounds) throw new Error('sync did not finish; try again');
    const res = await t.pull(keys.shopId, keys.authToken, ledger.versionVector(), PULL_LIMIT);
    relayVV = res.vv;
    const ops: unknown[] = [];
    for (const e of res.ops) {
      try { ops.push(await openOp(keys.key, e)); } catch { rejected++; }
    }
    const r = ledger.merge(ops);
    pulled += r.added; rejected += r.rejected;
    if (!res.more || res.ops.length === 0) break;
  }
  // 2. push everything the relay is missing, in batches
  const missing = ledger.since(relayVV);
  for (let i = 0; i < missing.length; i += PUSH_BATCH) {
    const batch = await Promise.all(missing.slice(i, i + PUSH_BATCH).map(op => sealOp(keys.key, op)));
    const r = await t.push(keys.shopId, keys.authToken, batch);
    pushed += r.stored;
    if (r.quota) { full = true; break; }
  }
  return { pulled, pushed, rejected, rounds, full };
}

/** Transport over HTTP(S) to the Hisaab relay. */
export function httpTransport(baseUrl: string, fetchImpl: typeof fetch = fetch.bind(globalThis), timeoutMs = 20000): Transport {
  const base = baseUrl.replace(/\/+$/, '');
  const call = async <T>(path: string, body: unknown): Promise<T> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new SyncError(res.status, (json as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`);
      return json as T;
    } finally { clearTimeout(timer); }
  };
  return {
    pull: (shop, token, vv, limit) => call(`/v1/shops/${shop}/pull`, { token, vv, limit }),
    push: (shop, token, ops) => call(`/v1/shops/${shop}/push`, { token, ops })
  };
}

export class SyncError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
