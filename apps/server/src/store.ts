import { createHash, timingSafeEqual } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export interface Envelope { dev: string; seq: number; ct: string }
export type VV = Record<string, number>;

/** Why an authorisation check failed; the API maps these to status codes. */
export type AuthResult = 'ok' | 'created' | 'denied' | 'unknown';

export interface Store {
  readonly kind: 'postgres' | 'memory';
  /** Check the write token; on a push to an unknown shop, register it (trust on first use). */
  authorize(shop: string, token: string, create: boolean): Promise<AuthResult>;
  push(shop: string, ops: Envelope[], maxOps: number): Promise<{ stored: number; quota: boolean }>;
  pull(shop: string, vv: VV, limit: number): Promise<{ ops: Envelope[]; more: boolean; vv: VV }>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export const tokenHash = (token: string) => createHash('sha256').update(token).digest();
const sameHash = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/** Highest contiguous sequence per device, from a list of (dev, seq). */
export function contiguous(rows: { dev: string; seq: number }[]): VV {
  const by = new Map<string, number[]>();
  for (const r of rows) (by.get(r.dev) ?? by.set(r.dev, []).get(r.dev)!).push(r.seq);
  const vv: VV = {};
  for (const [dev, seqs] of by) {
    seqs.sort((a, b) => a - b);
    let v = 0;
    for (const s of seqs) { if (s === v + 1) v = s; else if (s > v + 1) break; }
    vv[dev] = v;
  }
  return vv;
}

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private shops = new Map<string, { hash: Buffer; ops: Map<string, Envelope> }>();
  async authorize(shop: string, token: string, create: boolean): Promise<AuthResult> {
    const s = this.shops.get(shop);
    if (!s) {
      if (!create) return 'unknown';
      this.shops.set(shop, { hash: tokenHash(token), ops: new Map() });
      return 'created';
    }
    return sameHash(s.hash, tokenHash(token)) ? 'ok' : 'denied';
  }
  async push(shop: string, ops: Envelope[], maxOps: number) {
    const s = this.shops.get(shop)!;
    let stored = 0;
    for (const o of ops) {
      const k = `${o.dev}:${o.seq}`;
      if (s.ops.has(k)) continue;
      if (s.ops.size >= maxOps) return { stored, quota: true };
      s.ops.set(k, { ...o }); stored++;
    }
    return { stored, quota: false };
  }
  async pull(shop: string, vv: VV, limit: number) {
    const s = this.shops.get(shop);
    if (!s) return { ops: [], more: false, vv: {} };
    const all = [...s.ops.values()];
    const want = all.filter(o => o.seq > (vv[o.dev] ?? 0)).sort((a, b) => (a.dev < b.dev ? -1 : a.dev > b.dev ? 1 : a.seq - b.seq));
    return { ops: want.slice(0, limit), more: want.length > limit, vv: contiguous(all) };
  }
  async ping() { return true; }
  async close() {}
}

export class PgStore implements Store {
  readonly kind = 'postgres' as const;
  constructor(readonly pool: pg.Pool) {}
  static fromUrl(url: string) { return new PgStore(new pg.Pool({ connectionString: url, max: 10 })); }

  async authorize(shop: string, token: string, create: boolean): Promise<AuthResult> {
    const hash = tokenHash(token);
    if (create) {
      const ins = await this.pool.query('INSERT INTO shops (id, token_hash) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [shop, hash]);
      if (ins.rowCount === 1) return 'created';
    }
    const { rows } = await this.pool.query<{ token_hash: Buffer }>('UPDATE shops SET last_seen = now() WHERE id = $1 RETURNING token_hash', [shop]);
    if (!rows[0]) return 'unknown';
    return sameHash(rows[0].token_hash, hash) ? 'ok' : 'denied';
  }

  async push(shop: string, ops: Envelope[], maxOps: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ op_count: number }>('SELECT op_count FROM shops WHERE id = $1 FOR UPDATE', [shop]);
      const room = maxOps - rows[0].op_count;
      if (room <= 0) { await client.query('ROLLBACK'); return { stored: 0, quota: true }; }
      const batch = ops.slice(0, room);
      const res = await client.query(
        `INSERT INTO ops (shop_id, dev, seq, ct)
         SELECT $1, d, s, c FROM unnest($2::text[], $3::int[], $4::text[]) AS t(d, s, c)
         ON CONFLICT DO NOTHING`,
        [shop, batch.map(o => o.dev), batch.map(o => o.seq), batch.map(o => o.ct)]);
      const stored = res.rowCount ?? 0;
      await client.query('UPDATE shops SET op_count = op_count + $2 WHERE id = $1', [shop, stored]);
      await client.query('COMMIT');
      return { stored, quota: batch.length < ops.length };
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  }

  async pull(shop: string, vv: VV, limit: number) {
    const [opsRes, vvRes] = await Promise.all([
      this.pool.query<Envelope>(
        `SELECT dev, seq, ct FROM ops
          WHERE shop_id = $1 AND seq > COALESCE(($2::jsonb ->> dev)::int, 0)
          ORDER BY dev, seq LIMIT $3`, [shop, JSON.stringify(vv), limit + 1]),
      // highest contiguous sequence per device: the first row whose seq differs from its rank marks a gap
      this.pool.query<{ dev: string; vv: number }>(
        `SELECT dev, COALESCE(MIN(CASE WHEN seq <> rn THEN rn - 1 END), MAX(seq))::int AS vv
           FROM (SELECT dev, seq, ROW_NUMBER() OVER (PARTITION BY dev ORDER BY seq) AS rn FROM ops WHERE shop_id = $1) t
          GROUP BY dev`, [shop])
    ]);
    const more = opsRes.rows.length > limit;
    return { ops: opsRes.rows.slice(0, limit), more, vv: Object.fromEntries(vvRes.rows.map(r => [r.dev, r.vv])) };
  }

  async ping() { try { await this.pool.query('SELECT 1'); return true; } catch { return false; } }
  async close() { await this.pool.end(); }
}

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Apply migrations once each, in order, in transactions, under an advisory lock. */
export async function migrate(pool: pg.Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  const c = await pool.connect();
  const applied: string[] = [];
  try {
    await c.query('SELECT pg_advisory_lock(4417)');
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    for (const f of (await readdir(dir)).filter(f => /^\d+_.+\.sql$/.test(f)).sort()) {
      if (done.has(f)) continue;
      await c.query('BEGIN');
      try {
        await c.query(await readFile(join(dir, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await c.query('COMMIT');
        applied.push(f);
      } catch (e) { await c.query('ROLLBACK'); throw new Error(`migration ${f} failed: ${(e as Error).message}`); }
    }
  } finally { await c.query('SELECT pg_advisory_unlock(4417)').catch(() => {}); c.release(); }
  return applied;
}
