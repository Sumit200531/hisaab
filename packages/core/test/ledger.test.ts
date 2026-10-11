import { describe, it, expect } from 'vitest';
import { Ledger, reduce, validateOp, newDeviceId, type Op } from '../src/index.js';
import { encode, receive, tick, zero, MAX_DRIFT_MS } from '../src/hlc.js';

/** A controllable clock so tests are deterministic. */
const clockAt = (t0: number) => { let t = t0; const f = () => t; f.set = (v: number) => { t = v; }; f.add = (d: number) => { t += d; }; return f; };
function lcg(seed: number) { let x = seed >>> 0; return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32; }

describe('hybrid logical clock', () => {
  it('never goes backwards when the wall clock does', () => {
    let c = zero('dev1');
    c = tick(c, 1000);
    const a = encode(c);
    c = tick(c, 500);                 // phone clock moved back
    expect(encode(c) > a).toBe(true);
    expect(c.wall).toBe(1000);
  });
  it('orders a reply after the event it saw, even if the replier clock is behind', () => {
    const fast = tick(zero('aaaa'), 10_000);
    const slow = receive(zero('bbbb'), fast, 2_000);
    expect(encode(tick(slow, 2_001)) > encode(fast)).toBe(true);
  });
  it('ignores a remote clock that is days in the future', () => {
    const c = receive(tick(zero('aaaa'), 1000), { wall: 1000 + MAX_DRIFT_MS + 5, counter: 0, node: 'bbbb' }, 1000);
    expect(c.wall).toBe(1000);
  });
  it('encodings sort in time order', () => {
    const xs = [[5, 0], [5, 3], [40, 0], [1e12, 1], [1e12, 2], [2e12, 0]].map(([w, n]) => encode({ wall: w, counter: n, node: 'abcd' }));
    expect([...xs].sort()).toEqual(xs);
  });
});

describe('ledger basics', () => {
  it('tracks udhaar and payments in integer paise', () => {
    const l = new Ledger('shop1', [], clockAt(1_700_000_000_000));
    const r = l.addCustomer('Ramesh', '9876543210');
    l.addEntry(r, 'gave', 45_000, 'atta, daal');
    l.addEntry(r, 'gave', 12_050);
    l.addEntry(r, 'got', 20_000);
    const s = l.state();
    expect(s.byId[r].balance).toBe(37_050);
    expect(s.receivable).toBe(37_050);
    expect(s.byId[r].entries).toHaveLength(3);
  });

  it('a customer who paid more than owed shows as an advance, not a receivable', () => {
    const l = new Ledger('shop1', [], clockAt(1e12));
    const c = l.addCustomer('Sunita');
    l.addEntry(c, 'got', 50_000);
    expect(l.state().receivable).toBe(0);
    expect(l.state().advance).toBe(50_000);
  });

  it('voiding an entry removes it from the balance but keeps it in history', () => {
    const l = new Ledger('shop1', [], clockAt(1e12));
    const c = l.addCustomer('Pappu');
    const e = l.addEntry(c, 'gave', 10_000);
    l.addEntry(c, 'gave', 5_000);
    l.voidEntry(e);
    const cust = l.state().byId[c];
    expect(cust.balance).toBe(5_000);
    expect(cust.entries.find(x => x.eid === e)!.voided).toBe(true);
  });

  it('archived customers do not count toward totals', () => {
    const l = new Ledger('shop1', [], clockAt(1e12));
    const c = l.addCustomer('Old');
    l.addEntry(c, 'gave', 1_000);
    l.updateCustomer(c, 'archived', true);
    expect(l.state().receivable).toBe(0);
    expect(l.state().customers.at(-1)!.cid).toBe(c);
  });

  it('rejects bad local input', () => {
    const l = new Ledger('shop1', [], clockAt(1e12));
    const c = l.addCustomer('A');
    expect(() => l.addEntry(c, 'gave', 0)).toThrow();
    expect(() => l.addEntry(c, 'gave', 10.5)).toThrow();
    expect(() => l.addEntry(c, 'gave', -5)).toThrow();
    expect(() => l.addEntry('nope', 'gave', 5)).toThrow();
    expect(() => l.addCustomer('   ')).toThrow();
    expect(() => l.addCustomer('x'.repeat(61))).toThrow();
  });
});

describe('validation of untrusted operations', () => {
  const l = new Ledger('shop1', [], clockAt(1e12));
  const c = l.addCustomer('A');
  const good = l.all()[0];
  it('accepts a well-formed op', () => expect(validateOp(good)).toBe(true));
  it('rejects tampered or malformed ops', () => {
    const bad: unknown[] = [
      null, 5, 'x', {},
      { ...good, dev: 'other1' },                      // id node does not match dev
      { ...good, seq: 0 }, { ...good, seq: 1.5 },
      { ...good, id: 'garbage' },
      { ...good, t: 'drop_tables' },
      { ...good, name: '' },
      { id: good.id, dev: good.dev, seq: 9, t: 'entry', cid: c, kind: 'gave', amt: 1e15, note: '', at: 1 },
      { id: good.id, dev: good.dev, seq: 9, t: 'entry', cid: c, kind: 'stole', amt: 100, note: '', at: 1 },
      { id: good.id, dev: good.dev, seq: 9, t: 'cset', cid: c, f: 'archived', v: 'yes' },
      { id: good.id, dev: good.dev, seq: 9, t: 'set', f: '__proto__', v: 'x' }
    ];
    for (const b of bad) expect(validateOp(b), JSON.stringify(b)).toBe(false);
    const fresh = new Ledger('other1');
    expect(fresh.merge([...bad, good])).toEqual({ added: 1, rejected: bad.length });
  });
});

describe('sync between phones', () => {
  it('two phones editing offline converge after exchanging what the other lacks', () => {
    const t = clockAt(1e12);
    const a = new Ledger('phonea', [], t), b = new Ledger('phoneb', [], t);
    const c = a.addCustomer('Ramesh');
    b.merge(a.since(b.versionVector()));
    t.add(1000); a.addEntry(c, 'gave', 30_000);
    t.add(1000); b.addEntry(c, 'got', 10_000);
    t.add(1000); b.updateCustomer(c, 'phone', '9123456789');
    // exchange both ways using only version vectors
    const toB = a.since(b.versionVector()), toA = b.since(a.versionVector());
    expect(toB).toHaveLength(1);
    expect(toA).toHaveLength(2);
    b.merge(toB); a.merge(toA);
    expect(JSON.stringify(a.state())).toBe(JSON.stringify(b.state()));
    expect(a.state().byId[c].balance).toBe(20_000);
    expect(a.state().byId[c].phone).toBe('9123456789');
  });

  it('concurrent renames: the later edit wins on every phone, even with a skewed clock', () => {
    const ta = clockAt(1e12), tb = clockAt(1e12 - 3_600_000);   // phone B is an hour behind
    const a = new Ledger('phonea', [], ta), b = new Ledger('phoneb', [], tb);
    const c = a.addCustomer('Ramesh');
    b.merge(a.all());
    ta.add(10); a.updateCustomer(c, 'name', 'Ramesh Ji');
    b.merge(a.all());                    // B sees A's rename...
    tb.add(10); b.updateCustomer(c, 'name', 'Ramesh Kumar');   // ...and renames afterwards with a slow clock
    a.merge(b.all());
    expect(a.state().byId[c].name).toBe('Ramesh Kumar');
    expect(b.state().byId[c].name).toBe('Ramesh Kumar');
  });

  it('a void that arrives before its entry still cancels it', () => {
    const a = new Ledger('phonea', [], clockAt(1e12));
    const c = a.addCustomer('X');
    const e = a.addEntry(c, 'gave', 500);
    a.voidEntry(e);
    const ops = a.all().reverse();
    const b = new Ledger('phoneb');
    for (const o of ops) b.merge([o]);
    expect(b.state().byId[c].balance).toBe(0);
  });

  it('out-of-order delivery leaves a gap in the version vector until it is filled', () => {
    const a = new Ledger('phonea', [], clockAt(1e12));
    const c = a.addCustomer('X');
    for (let i = 0; i < 4; i++) a.addEntry(c, 'gave', 100 * (i + 1));
    const ops = a.all();
    const b = new Ledger('phoneb');
    b.merge([ops[0], ops[1], ops[3], ops[4]]);
    expect(b.versionVector().phonea).toBe(2);          // seq 3 missing
    expect(b.since({}).length).toBe(4);
    b.merge([ops[2]]);
    expect(b.versionVector().phonea).toBe(5);
    expect(b.state().byId[c].balance).toBe(a.state().byId[c].balance);
  });

  it('restoring a backup onto a fresh install continues the same device sequence', () => {
    const t = clockAt(1e12);
    const a = new Ledger('phonea', [], t);
    const c = a.addCustomer('X');
    a.addEntry(c, 'gave', 100);
    const restored = new Ledger('phonea', a.all(), clockAt(1e12 - 999_999));   // new phone, clock behind
    const e = restored.addEntry(c, 'gave', 200);
    const op = restored.all().find(o => o.id === e)!;
    expect(op.seq).toBe(3);
    expect(op.id > a.all()[1].id).toBe(true);
  });

  it('randomized: any delivery order, with duplicates and partial syncs, converges to one state', () => {
    for (let trial = 0; trial < 60; trial++) {
      const rnd = lcg(1000 + trial);
      const t = clockAt(1.7e12);
      const devs = ['phonea', 'phoneb', 'phonec'].map(d => new Ledger(d, [], () => t() + Math.floor(rnd() * 7_200_000) - 3_600_000));
      const seed = devs[0].addCustomer('Seed');
      for (const d of devs.slice(1)) d.merge(devs[0].all());
      for (let step = 0; step < 80; step++) {
        t.add(1000);
        const d = devs[Math.floor(rnd() * 3)];
        const st = d.state();
        const custs = st.customers.map(x => x.cid);
        const r = rnd();
        if (r < 0.1) d.addCustomer('C' + step);
        else if (r < 0.6) d.addEntry(custs[Math.floor(rnd() * custs.length)] ?? seed, rnd() < 0.6 ? 'gave' : 'got', 1 + Math.floor(rnd() * 100_000));
        else if (r < 0.7) { const es = st.customers.flatMap(x => x.entries); if (es.length) d.voidEntry(es[Math.floor(rnd() * es.length)].eid); }
        else if (r < 0.8) d.updateCustomer(custs[Math.floor(rnd() * custs.length)], 'name', 'N' + step);
        else if (r < 0.85) d.setSetting('shopName', 'Shop ' + step);
        else {
          // partial sync between two random phones, in a random subset and order
          const other = devs[Math.floor(rnd() * 3)];
          const batch = d.since(other.versionVector()).filter(() => rnd() < 0.7).sort(() => rnd() - 0.5);
          other.merge(batch);
        }
      }
      // final: every phone receives everything, shuffled, with duplicates
      const everything = devs.flatMap(d => d.all());
      for (const d of devs) d.merge([...everything, ...everything.slice(0, 20)].sort(() => rnd() - 0.5));
      const states = devs.map(d => JSON.stringify(d.state()));
      expect(new Set(states).size, `trial ${trial}`).toBe(1);
      // and the state equals a reduction of the raw op set in a different order
      expect(JSON.stringify(reduce([...everything].reverse()))).toBe(states[0]);
      for (const d of devs) expect(d.versionVector()).toEqual(devs[0].versionVector());
    }
  });

  it('balances always equal the sum of live entries', () => {
    const rnd = lcg(7);
    const l = new Ledger('phonea', [], clockAt(1e12));
    const cs = Array.from({ length: 5 }, (_, i) => l.addCustomer('C' + i));
    const live: Op[] = [];
    for (let i = 0; i < 300; i++) {
      const c = cs[Math.floor(rnd() * 5)];
      l.addEntry(c, rnd() < 0.5 ? 'gave' : 'got', 1 + Math.floor(rnd() * 1e6));
      if (rnd() < 0.1) { const es = l.state().byId[c].entries.filter(e => !e.voided); if (es.length) l.voidEntry(es[0].eid); }
    }
    for (const c of l.state().customers) {
      const sum = c.entries.filter(e => !e.voided).reduce((a, e) => a + (e.kind === 'gave' ? e.amt : -e.amt), 0);
      expect(c.balance).toBe(sum);
    }
    void live;
  });

  it('device ids are well-formed', () => {
    for (let i = 0; i < 50; i++) expect(newDeviceId()).toMatch(/^[a-z0-9]{10}$/);
  });
});
