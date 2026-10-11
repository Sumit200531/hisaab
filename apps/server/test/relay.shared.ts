import { expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Ledger, deriveKeys, newSyncCode, syncLedger, sealOp } from '@hisaab/core';
import { injectTransport } from './harness.js';
import type { Store } from '../src/store.js';

/** The same behavioural suite runs against every Store implementation. */
export function relaySuite(getApp: () => FastifyInstance, getStore: () => Store) {
  const clock = () => { let t = 1.7e12; return () => (t += 1000); };

  it('two phones stay in sync through the relay, each change made offline', async () => {
    const keys = await deriveKeys(newSyncCode());
    const t = injectTransport(getApp());
    const a = new Ledger('phonea', [], clock()), b = new Ledger('phoneb', [], clock());
    const c = a.addCustomer('Ramesh');
    a.addEntry(c, 'gave', 45_000);
    expect(await syncLedger(a, keys, t)).toMatchObject({ pushed: 2, pulled: 0 });
    expect(await syncLedger(b, keys, t)).toMatchObject({ pulled: 2, pushed: 0 });
    b.addEntry(c, 'got', 20_000);                 // B offline
    a.addEntry(c, 'gave', 5_000);                 // A offline
    await syncLedger(b, keys, t);
    await syncLedger(a, keys, t);
    await syncLedger(b, keys, t);
    expect(JSON.stringify(a.state())).toBe(JSON.stringify(b.state()));
    expect(a.state().byId[c].balance).toBe(30_000);
    // a further sync with nothing new transfers nothing
    expect(await syncLedger(a, keys, t)).toMatchObject({ pulled: 0, pushed: 0 });
  });

  it('a new phone restores everything from the relay with just the sync code', async () => {
    const code = newSyncCode();
    const t = injectTransport(getApp());
    const a = new Ledger('phonea', [], clock());
    const cs = Array.from({ length: 30 }, (_, i) => a.addCustomer('C' + i));
    for (let i = 0; i < 700; i++) a.addEntry(cs[i % 30], i % 3 ? 'gave' : 'got', 100 + i);   // > one pull page, > several push batches
    await syncLedger(a, await deriveKeys(code), t);
    const fresh = new Ledger('newphone');
    const r = await syncLedger(fresh, await deriveKeys(code), t);
    expect(r.pulled).toBe(730);
    expect(r.rounds).toBeGreaterThan(1);
    expect(JSON.stringify(fresh.state())).toBe(JSON.stringify(a.state()));
  });

  it('the relay never receives anything readable', async () => {
    const keys = await deriveKeys(newSyncCode());
    const seen: string[] = [];
    const t = injectTransport(getApp(), (_p, body) => seen.push(JSON.stringify(body)));
    const a = new Ledger('phonea', [], clock());
    const c = a.addCustomer('Sunita Devi', '9876543210');
    a.addEntry(c, 'gave', 12_345, 'doodh ka hisaab');
    await syncLedger(a, keys, t);
    const wire = seen.join('\n');
    for (const secret of ['Sunita', '9876543210', 'doodh', '12345', keys.code]) expect(wire).not.toContain(secret);
  });

  it('rejects a phone with the wrong sync code', async () => {
    const code = newSyncCode();
    const t = injectTransport(getApp());
    const owner = new Ledger('phonea', [], clock());
    owner.addCustomer('x');
    await syncLedger(owner, await deriveKeys(code), t);
    const real = await deriveKeys(code);
    const forged = { ...(await deriveKeys(newSyncCode())), shopId: real.shopId };   // knows the id, not the code
    const err = await syncLedger(new Ledger('evil1'), forged, t).catch(e => e);
    expect(err.status).toBe(403);
  });

  it('pushing the same operations again is harmless', async () => {
    const keys = await deriveKeys(newSyncCode());
    const t = injectTransport(getApp());
    const a = new Ledger('phonea', [], clock());
    a.addEntry(a.addCustomer('X'), 'gave', 100);
    const envs = await Promise.all(a.all().map(o => sealOp(keys.key, o)));
    expect((await t.push(keys.shopId, keys.authToken, envs)).stored).toBe(2);
    expect((await t.push(keys.shopId, keys.authToken, envs)).stored).toBe(0);
    const res = await t.pull(keys.shopId, keys.authToken, {}, 100);
    expect(res.ops).toHaveLength(2);
    expect(res.vv).toEqual({ phonea: 2 });
  });

  it('reports the highest contiguous sequence when the relay holds a gap', async () => {
    const keys = await deriveKeys(newSyncCode());
    const t = injectTransport(getApp());
    const a = new Ledger('phonea', [], clock());
    const c = a.addCustomer('X');
    for (let i = 0; i < 4; i++) a.addEntry(c, 'gave', 100);
    const envs = await Promise.all(a.all().map(o => sealOp(keys.key, o)));
    await t.push(keys.shopId, keys.authToken, [envs[0], envs[1], envs[3]]);   // seq 3 lost in transit
    expect((await t.pull(keys.shopId, keys.authToken, {}, 10)).vv).toEqual({ phonea: 2 });
    await syncLedger(a, keys, t);                                               // the phone fills the gap
    expect((await t.pull(keys.shopId, keys.authToken, {}, 10)).vv).toEqual({ phonea: 5 });
  });

  it('a tampered blob from the relay is rejected by the phone, not merged', async () => {
    const keys = await deriveKeys(newSyncCode());
    const t = injectTransport(getApp());
    const a = new Ledger('phonea', [], clock());
    a.addCustomer('Honest');
    const env = await sealOp(keys.key, a.all()[0]);
    await t.push(keys.shopId, keys.authToken, [{ ...env, ct: env.ct.slice(0, -6) + 'AAAAAA' }]);
    const b = new Ledger('phoneb');
    const r = await syncLedger(b, keys, t);
    expect(r.rejected).toBe(1);
    expect(b.size).toBe(0);
  });

  it('validates requests strictly', async () => {
    const app = getApp();
    const keys = await deriveKeys(newSyncCode());
    const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as object });
    const ok = { token: keys.authToken, ops: [{ dev: 'phonea', seq: 1, ct: 'A'.repeat(60) }] };
    expect((await post(`/v1/shops/${keys.shopId}/push`, ok)).statusCode).toBe(200);
    const bad: [string, unknown][] = [
      [`/v1/shops/NOTHEX/push`, ok],
      [`/v1/shops/${keys.shopId}/push`, { ...ok, token: 'short' }],
      [`/v1/shops/${keys.shopId}/push`, { ...ok, ops: [] }],
      [`/v1/shops/${keys.shopId}/push`, { ...ok, ops: [{ dev: 'Bad Dev', seq: 1, ct: 'A'.repeat(60) }] }],
      [`/v1/shops/${keys.shopId}/push`, { ...ok, ops: [{ dev: 'phonea', seq: 0, ct: 'A'.repeat(60) }] }],
      [`/v1/shops/${keys.shopId}/push`, { ...ok, ops: [{ dev: 'phonea', seq: 1, ct: 'A'.repeat(9000) }] }],
      [`/v1/shops/${keys.shopId}/push`, { ...ok, ops: [{ dev: 'phonea', seq: 1, ct: '<script>'.padEnd(60, 'x') }] }],
      [`/v1/shops/${keys.shopId}/push`, { ...ok, extra: 1 }],
      [`/v1/shops/${keys.shopId}/pull`, { token: keys.authToken, limit: 5000 }]
    ];
    for (const [url, body] of bad) expect((await post(url, body)).statusCode, `${url} ${JSON.stringify(body).slice(0, 80)}`).toBe(400);
    expect((await app.inject('/v1/nothing')).statusCode).toBe(404);
  });

  it('pulling a shop that has never pushed returns nothing (and does not create it)', async () => {
    const keys = await deriveKeys(newSyncCode());
    const t = injectTransport(getApp());
    expect(await t.pull(keys.shopId, keys.authToken, {}, 10)).toEqual({ ops: [], more: false, vv: {} });
    expect(await getStore().authorize(keys.shopId, keys.authToken, false)).toBe('unknown');
  });
}
