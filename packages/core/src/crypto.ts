/**
 * End-to-end encryption for sync and backups (WebCrypto: browsers and Node 20+).
 *
 * A shop is identified by a random 120-bit sync code, shown once as
 * "K7QM-2XRA-..." and typed on the second phone. Three independent keys are
 * derived from it with HKDF-SHA256:
 *
 *   enc  - AES-256-GCM key for every operation and backup file
 *   id   - the public shop id the relay files data under
 *   auth - a write token; the relay stores only its SHA-256
 *
 * The relay therefore sees opaque blobs plus (device, sequence) numbers, and
 * cannot read, forge or reorder entries: each ciphertext is bound to its
 * device and sequence as AES-GCM additional data.
 */
import { validateOp, type Op } from './ledger.js';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford base32: no I, L, O, U
const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('WebCrypto is not available (use HTTPS or localhost)');
  return s;
};
const enc = new TextEncoder(), dec = new TextDecoder();

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

function toBase32(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** A new random sync code: 24 base32 characters (120 bits), grouped for reading aloud. */
export function newSyncCode(): string {
  return toBase32(randomBytes(15)).match(/.{4}/g)!.join('-');
}

/** Normalise what a person typed: case, spaces, dashes and look-alike letters. Null if invalid. */
export function parseSyncCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s\-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  if (s.length !== 24 || [...s].some(c => !ALPHABET.includes(c))) return null;
  return s.match(/.{4}/g)!.join('-');
}

export const b64url = {
  encode(b: Uint8Array): string {
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Uint8Array {
    const t = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  }
};
const hex = (b: Uint8Array) => [...b].map(x => x.toString(16).padStart(2, '0')).join('');

export interface ShopKeys { code: string; shopId: string; authToken: string; key: CryptoKey }

export async function deriveKeys(code: string): Promise<ShopKeys> {
  const norm = parseSyncCode(code);
  if (!norm) throw new Error('invalid sync code');
  const base = await subtle().importKey('raw', enc.encode(norm), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const salt = enc.encode('hisaab/v1');
  const bits = async (info: string) => new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) }, base, 256));
  const key = await subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('enc') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { code: norm, shopId: hex((await bits('id')).slice(0, 16)), authToken: b64url.encode(await bits('auth')), key };
}

async function seal(key: CryptoKey, plaintext: string, aad: string): Promise<string> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(plaintext)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return b64url.encode(out);
}

async function open(key: CryptoKey, sealed: string, aad: string): Promise<string> {
  const raw = b64url.decode(sealed);
  if (raw.length < 13) throw new Error('ciphertext too short');
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: enc.encode(aad) }, key, raw.slice(12));
  return dec.decode(pt);
}

/** What travels to the relay: routing metadata in the clear, the operation sealed. */
export interface Envelope { dev: string; seq: number; ct: string }

export async function sealOp(key: CryptoKey, op: Op): Promise<Envelope> {
  return { dev: op.dev, seq: op.seq, ct: await seal(key, JSON.stringify(op), `op:${op.dev}:${op.seq}`) };
}

/** Decrypt and verify an envelope. Throws if it was tampered with or re-labelled. */
export async function openOp(key: CryptoKey, e: Envelope): Promise<Op> {
  const op: unknown = JSON.parse(await open(key, e.ct, `op:${e.dev}:${e.seq}`));
  if (!validateOp(op) || op.dev !== e.dev || op.seq !== e.seq) throw new Error('envelope does not match its operation');
  return op;
}

/* -------------------------------------------------------------- backups */

export interface BackupFile { format: 'hisaab-backup'; v: 1; shop: string; createdAt: string; ops: number; data: string }

export async function makeBackup(keys: ShopKeys, ops: Op[], now = new Date()): Promise<BackupFile> {
  return { format: 'hisaab-backup', v: 1, shop: keys.shopId, createdAt: now.toISOString(), ops: ops.length, data: await seal(keys.key, JSON.stringify(ops), `backup:${keys.shopId}`) };
}

export class BackupError extends Error {
  constructor(readonly reason: 'not-a-backup' | 'wrong-shop' | 'damaged') { super(reason); }
}

/** Decrypt a backup file's operations. They still go through Ledger.merge validation. */
export async function readBackup(keys: ShopKeys, file: unknown): Promise<unknown[]> {
  const f = file as Partial<BackupFile>;
  if (!f || f.format !== 'hisaab-backup' || f.v !== 1 || typeof f.data !== 'string') throw new BackupError('not-a-backup');
  if (f.shop !== keys.shopId) throw new BackupError('wrong-shop');
  try {
    const ops = JSON.parse(await open(keys.key, f.data, `backup:${keys.shopId}`));
    if (!Array.isArray(ops)) throw new Error();
    return ops;
  } catch { throw new BackupError('damaged'); }
}
