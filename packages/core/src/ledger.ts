import { decode, encode, receive, tick, zero, NODE_RE, type Clock } from './hlc.js';

/**
 * The ledger is an append-only set of operations. Every phone keeps its own copy
 * and the state on screen is a pure function of that set, so two phones that
 * hold the same operations always show exactly the same balances, regardless of
 * the order the operations arrived in, or how many times. That is what lets the
 * app work fully offline and sync later over any channel (server, file, WhatsApp).
 *
 *  - Customers and settings are last-writer-wins registers, per field.
 *  - Entries (udhaar given / payment received) are immutable; a mistake is undone
 *    with a `void` tombstone, which wins over the entry no matter the order.
 *  - Amounts are integer paise, so balances never suffer floating-point drift.
 */

export type EntryKind = 'gave' | 'got';            // gave = udhaar diya (customer owes more), got = paise mile
export type CustomerField = 'name' | 'phone' | 'archived';
export type SettingField = 'shopName' | 'upi' | 'owner';

interface OpBase { id: string; dev: string; seq: number }
export type Op = OpBase & (
  | { t: 'cust'; name: string; phone: string }
  | { t: 'cset'; cid: string; f: CustomerField; v: string | boolean }
  | { t: 'entry'; cid: string; kind: EntryKind; amt: number; note: string; at: number }
  | { t: 'void'; eid: string }
  | { t: 'set'; f: SettingField; v: string }
);

export interface Entry { eid: string; cid: string; kind: EntryKind; amt: number; note: string; at: number; dev: string; voided: boolean }
export interface Customer {
  cid: string; name: string; phone: string; archived: boolean; createdAt: number;
  balance: number;          // paise; > 0 means the customer owes the shop
  lastAt: number;           // date of the latest live entry (0 if none)
  entries: Entry[];         // newest first, including voided ones
}
export interface Settings { shopName: string; upi: string; owner: string }
export interface LedgerState {
  customers: Customer[];    // live customers, then archived ones
  byId: Record<string, Customer>;
  settings: Settings;
  receivable: number;       // total owed to the shop (paise)
  advance: number;          // total customers have paid in advance (paise, positive)
  entryCount: number;
}

export type VersionVector = Record<string, number>;

export const LIMITS = { name: 60, phone: 20, note: 140, setting: 80, maxAmount: 100_000_000_00 /* ₹10 crore */ };

const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

/** Reject anything malformed before it touches the ledger: ops arrive from files and networks. */
export function validateOp(o: unknown): o is Op {
  if (!o || typeof o !== 'object') return false;
  const op = o as Record<string, unknown>;
  if (typeof op.id !== 'string' || typeof op.dev !== 'string' || !NODE_RE.test(op.dev)) return false;
  if (!Number.isInteger(op.seq) || (op.seq as number) < 1) return false;
  const c = decode(op.id);
  if (!c || c.node !== op.dev) return false;
  switch (op.t) {
    case 'cust': return str(op.name, LIMITS.name) && op.name.trim().length > 0 && str(op.phone, LIMITS.phone);
    case 'cset':
      if (typeof op.cid !== 'string' || !decode(op.cid)) return false;
      if (op.f === 'archived') return typeof op.v === 'boolean';
      if (op.f === 'name') return str(op.v, LIMITS.name) && op.v.trim().length > 0;
      if (op.f === 'phone') return str(op.v, LIMITS.phone);
      return false;
    case 'entry':
      return typeof op.cid === 'string' && !!decode(op.cid) && (op.kind === 'gave' || op.kind === 'got') &&
        Number.isInteger(op.amt) && (op.amt as number) > 0 && (op.amt as number) <= LIMITS.maxAmount &&
        str(op.note, LIMITS.note) && Number.isFinite(op.at) && (op.at as number) > 0;
    case 'void': return typeof op.eid === 'string' && !!decode(op.eid);
    case 'set': return (op.f === 'shopName' || op.f === 'upi' || op.f === 'owner') && str(op.v, LIMITS.setting);
    default: return false;
  }
}

/** Fold a set of operations into state. Pure and order-independent. */
export function reduce(ops: Iterable<Op>): LedgerState {
  const sorted = [...ops].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const custs = new Map<string, Customer & { stamps: Record<string, string> }>();
  const entries = new Map<string, Entry>();
  const voided = new Set<string>();
  const settings: Settings = { shopName: '', upi: '', owner: '' };
  const settingStamp: Record<string, string> = {};
  const pendingSets: Extract<Op, { t: 'cset' }>[] = [];

  for (const op of sorted) {
    switch (op.t) {
      case 'cust':
        if (!custs.has(op.id)) custs.set(op.id, {
          cid: op.id, name: op.name.trim(), phone: op.phone, archived: false, createdAt: decode(op.id)!.wall,
          balance: 0, lastAt: 0, entries: [], stamps: { name: op.id, phone: op.id, archived: op.id }
        });
        break;
      case 'cset': pendingSets.push(op); break;
      case 'entry':
        entries.set(op.id, { eid: op.id, cid: op.cid, kind: op.kind, amt: op.amt, note: op.note, at: op.at, dev: op.dev, voided: false });
        break;
      case 'void': voided.add(op.eid); break;
      case 'set':
        if (!settingStamp[op.f] || op.id > settingStamp[op.f]) { settings[op.f] = op.v; settingStamp[op.f] = op.id; }
        break;
    }
  }
  // field updates: the latest stamp wins (applied after creation, so an update can never be lost to ordering)
  for (const op of pendingSets) {
    const c = custs.get(op.cid);
    if (!c || op.id <= c.stamps[op.f]) continue;
    c.stamps[op.f] = op.id;
    if (op.f === 'archived') c.archived = op.v as boolean;
    else if (op.f === 'name') c.name = (op.v as string).trim();
    else c.phone = op.v as string;
  }
  let entryCount = 0;
  for (const e of entries.values()) {
    const c = custs.get(e.cid);
    if (!c) continue;                         // its customer has not arrived yet; it will appear once it does
    e.voided = voided.has(e.eid);
    c.entries.push(e);
    if (e.voided) continue;
    entryCount++;
    c.balance += e.kind === 'gave' ? e.amt : -e.amt;
    if (e.at > c.lastAt) c.lastAt = e.at;
  }
  let receivable = 0, advance = 0;
  const list: Customer[] = [];
  for (const c of custs.values()) {
    c.entries.sort((a, b) => b.at - a.at || (a.eid < b.eid ? 1 : -1));
    const { stamps: _stamps, ...pub } = c;
    list.push(pub);
    if (!c.archived) { if (c.balance > 0) receivable += c.balance; else advance -= c.balance; }
  }
  list.sort((a, b) => Number(a.archived) - Number(b.archived) || (b.lastAt || b.createdAt) - (a.lastAt || a.createdAt) || a.name.localeCompare(b.name));
  return { customers: list, byId: Object.fromEntries(list.map(c => [c.cid, c])), settings, receivable, advance, entryCount };
}

/**
 * One device's replica: its operations plus the logic to create new ones and to
 * exchange them with other replicas using version vectors.
 */
export class Ledger {
  readonly dev: string;
  private clock: Clock;
  private ops = new Map<string, Op>();
  private seqs = new Map<string, Set<number>>();   // received sequence numbers per device
  private vv: VersionVector = {};                 // highest contiguous sequence per device
  private cache: LedgerState | null = null;
  private now: () => number;
  version = 0;                                    // bumps on every change (for UI subscriptions)

  constructor(dev: string, ops: Op[] = [], now: () => number = Date.now) {
    this.dev = dev;
    this.clock = zero(dev);
    this.now = now;
    this.merge(ops);
  }

  /* -------------------------------------------------------- local actions */
  private emit<T extends Op>(body: Omit<T, 'id' | 'dev' | 'seq'>): T {
    this.clock = tick(this.clock, this.now());
    const op = { ...body, id: encode(this.clock), dev: this.dev, seq: (this.vv[this.dev] ?? 0) + 1 } as T;
    if (!validateOp(op)) throw new Error(`invalid operation ${JSON.stringify(op)}`);
    this.insert(op);
    return op;
  }

  addCustomer(name: string, phone = ''): string {
    return this.emit<Extract<Op, { t: 'cust' }>>({ t: 'cust', name: name.trim(), phone }).id;
  }
  updateCustomer(cid: string, f: CustomerField, v: string | boolean) {
    if (!this.state().byId[cid]) throw new Error('unknown customer');
    this.emit<Extract<Op, { t: 'cset' }>>({ t: 'cset', cid, f, v });
  }
  addEntry(cid: string, kind: EntryKind, amt: number, note = '', at = this.now()): string {
    if (!this.state().byId[cid]) throw new Error('unknown customer');
    return this.emit<Extract<Op, { t: 'entry' }>>({ t: 'entry', cid, kind, amt, note, at }).id;
  }
  voidEntry(eid: string) {
    this.emit<Extract<Op, { t: 'void' }>>({ t: 'void', eid });
  }
  setSetting(f: SettingField, v: string) {
    this.emit<Extract<Op, { t: 'set' }>>({ t: 'set', f, v });
  }

  /* -------------------------------------------------------- replication */
  private insert(op: Op): boolean {
    if (this.ops.has(op.id)) return false;
    let s = this.seqs.get(op.dev);
    if (!s) this.seqs.set(op.dev, (s = new Set()));
    if (s.has(op.seq)) return false;             // same device and sequence but a different id: keep the first
    s.add(op.seq);
    this.ops.set(op.id, op);
    let v = this.vv[op.dev] ?? 0;
    while (s.has(v + 1)) v++;
    this.vv[op.dev] = v;
    this.cache = null;
    this.version++;
    return true;
  }

  /** Merge operations from anywhere. Invalid ones are skipped and counted. Idempotent. */
  merge(incoming: unknown[]): { added: number; rejected: number } {
    let added = 0, rejected = 0;
    for (const o of incoming) {
      if (!validateOp(o)) { rejected++; continue; }
      if (this.insert(o)) {
        added++;
        if (o.dev !== this.dev) this.clock = receive(this.clock, decode(o.id)!, this.now());
        else if (o.id > encode(this.clock)) this.clock = decode(o.id)!;   // restoring our own history
      }
    }
    return { added, rejected };
  }

  versionVector(): VersionVector { return { ...this.vv }; }

  /** Operations the holder of `remote` has not seen, in per-device sequence order. */
  since(remote: VersionVector = {}): Op[] {
    return [...this.ops.values()]
      .filter(o => o.seq > (remote[o.dev] ?? 0))
      .sort((a, b) => (a.dev < b.dev ? -1 : a.dev > b.dev ? 1 : a.seq - b.seq));
  }

  all(): Op[] { return this.since({}); }
  get size() { return this.ops.size; }

  state(): LedgerState { return (this.cache ??= reduce(this.ops.values())); }
}

/** A random device id: 10 base-36 characters. */
export function newDeviceId(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += Math.floor(rand() * 36).toString(36);
  return s;
}
