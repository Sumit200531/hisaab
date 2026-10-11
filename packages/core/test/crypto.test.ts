import { describe, it, expect } from 'vitest';
import { newSyncCode, parseSyncCode, deriveKeys, sealOp, openOp, makeBackup, readBackup, BackupError, Ledger, b64url } from '../src/index.js';

const ledgerWithData = () => {
  const l = new Ledger('phonea', [], () => 1.7e12);
  const c = l.addCustomer('Ramesh Kumar', '9876543210');
  l.addEntry(c, 'gave', 45_000, 'atta daal');
  return l;
};

describe('sync codes', () => {
  it('are 24 base32 characters in groups of four, and random', () => {
    const codes = new Set(Array.from({ length: 200 }, newSyncCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
  });
  it('tolerate how people type them', () => {
    const c = newSyncCode();
    expect(parseSyncCode(c.toLowerCase().replace(/-/g, ' '))).toBe(c);
    expect(parseSyncCode('oooo-iiii-llll-0000-1111-2222')).toBe('0000-1111-1111-0000-1111-2222');
    expect(parseSyncCode('too-short')).toBeNull();
    expect(parseSyncCode('')).toBeNull();
  });
});

describe('key derivation', () => {
  it('is deterministic per code and separates id, token and key', async () => {
    const code = newSyncCode();
    const [a, b] = await Promise.all([deriveKeys(code), deriveKeys(code.toLowerCase())]);
    expect(a.shopId).toBe(b.shopId);
    expect(a.authToken).toBe(b.authToken);
    expect(a.shopId).toMatch(/^[0-9a-f]{32}$/);
    expect(a.authToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const other = await deriveKeys(newSyncCode());
    expect(other.shopId).not.toBe(a.shopId);
    await expect(deriveKeys('nope')).rejects.toThrow();
  });
});

describe('sealed operations', () => {
  it('round-trip, and the ciphertext reveals nothing readable', async () => {
    const keys = await deriveKeys(newSyncCode());
    const op = ledgerWithData().all()[0];
    const env = await sealOp(keys.key, op);
    expect(env).toMatchObject({ dev: 'phonea', seq: 1 });
    expect(env.ct).not.toContain('Ramesh');
    expect(new TextDecoder().decode(b64url.decode(env.ct))).not.toContain('Ramesh');
    expect(await openOp(keys.key, env)).toEqual(op);
  });
  it('detect tampering, relabelling and the wrong key', async () => {
    const keys = await deriveKeys(newSyncCode());
    const [op1, op2] = ledgerWithData().all();
    const e1 = await sealOp(keys.key, op1), e2 = await sealOp(keys.key, op2);
    await expect(openOp(keys.key, { ...e1, seq: 2 })).rejects.toThrow();                 // relay re-labels an op
    await expect(openOp(keys.key, { ...e2, ct: e1.ct })).rejects.toThrow();              // relay swaps payloads
    const raw = b64url.decode(e1.ct); raw[20] ^= 1;
    await expect(openOp(keys.key, { ...e1, ct: b64url.encode(raw) })).rejects.toThrow(); // flipped bit
    const stranger = await deriveKeys(newSyncCode());
    await expect(openOp(stranger.key, e1)).rejects.toThrow();
  });
});

describe('backup files', () => {
  it('restore the whole ledger on a new phone', async () => {
    const code = newSyncCode();
    const l = ledgerWithData();
    const file = JSON.parse(JSON.stringify(await makeBackup(await deriveKeys(code), l.all())));
    expect(file).toMatchObject({ format: 'hisaab-backup', v: 1, ops: 2 });
    expect(JSON.stringify(file)).not.toContain('Ramesh');
    const fresh = new Ledger('phoneb');
    fresh.merge(await readBackup(await deriveKeys(code), file));
    expect(JSON.stringify(fresh.state())).toBe(JSON.stringify(l.state()));
  });
  it('explain why a file cannot be restored', async () => {
    const keys = await deriveKeys(newSyncCode());
    const file = await makeBackup(keys, ledgerWithData().all());
    const reason = (p: Promise<unknown>) => p.then(() => 'ok', (e: BackupError) => e.reason);
    expect(await reason(readBackup(keys, { hello: 1 }))).toBe('not-a-backup');
    expect(await reason(readBackup(await deriveKeys(newSyncCode()), file))).toBe('wrong-shop');
    expect(await reason(readBackup(keys, { ...file, data: file.data.slice(0, -4) + 'AAAA' }))).toBe('damaged');
  });
});
