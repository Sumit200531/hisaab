import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Ledger, deriveKeys, newSyncCode, syncLedger } from '@hisaab/core';
import { buildApp } from '../src/app.js';
import { MemoryStore, contiguous } from '../src/store.js';
import { relaySuite } from './relay.shared.js';
import { injectTransport } from './harness.js';

let app: FastifyInstance;
const store = new MemoryStore();
beforeAll(async () => { app = await buildApp({ store }); });
afterAll(async () => { await app.close(); });

describe('relay (memory store)', () => {
  relaySuite(() => app, () => store);

  it('health', async () => {
    expect((await app.inject('/health')).json()).toEqual({ ok: true, storage: 'memory', database: 'n/a' });
  });
});

describe('relay limits', () => {
  it('rate-limits a runaway client', async () => {
    const limited = await buildApp({ store: new MemoryStore(), rateLimit: { perMinute: 5 } });
    const keys = await deriveKeys(newSyncCode());
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await limited.inject({ method: 'POST', url: `/v1/shops/${keys.shopId}/pull`, payload: { token: keys.authToken } })).statusCode);
    expect(codes.slice(0, 5).every(c => c === 200)).toBe(true);
    expect(codes.slice(5).every(c => c === 429)).toBe(true);
    expect((await limited.inject('/health')).statusCode).toBe(200);   // health is not limited
    await limited.close();
  });

  it('enforces a per-shop quota', async () => {
    const small = await buildApp({ store: new MemoryStore(), maxOpsPerShop: 3 });
    const keys = await deriveKeys(newSyncCode());
    const l = new Ledger('phonea');
    const c = l.addCustomer('X');
    for (let i = 0; i < 5; i++) l.addEntry(c, 'gave', 100);
    const t = injectTransport(small);
    const first = await syncLedger(l, keys, t);
    expect(first).toMatchObject({ pushed: 3, full: true });
    const err = await syncLedger(l, keys, t).catch(e => e);
    expect(err.status).toBe(507);
    await small.close();
  });

  it('computes contiguous version vectors', () => {
    expect(contiguous([{ dev: 'a', seq: 1 }, { dev: 'a', seq: 2 }, { dev: 'a', seq: 4 }, { dev: 'b', seq: 2 }])).toEqual({ a: 2, b: 0 });
  });
});
