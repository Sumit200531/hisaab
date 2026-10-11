import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { PgStore, migrate } from '../src/store.js';
import { relaySuite } from './relay.shared.js';
import { startPostgres } from './pg-helper.js';

let server: Awaited<ReturnType<typeof startPostgres>>;
let store: PgStore;
let app: FastifyInstance;

beforeAll(async () => {
  server = await startPostgres();
  store = PgStore.fromUrl(server.url);
  await migrate(store.pool);
  app = await buildApp({ store });
}, 120_000);
afterAll(async () => { await app?.close(); await store?.close(); await server?.stop(); });

describe('relay (real PostgreSQL)', () => {
  relaySuite(() => app, () => store);

  it('migrations are idempotent and safe to run concurrently', async () => {
    expect((await Promise.all([migrate(store.pool), migrate(store.pool)])).flat()).toEqual([]);
  });

  it('stores only ciphertext, token hashes and routing numbers', async () => {
    const other = new pg.Pool({ connectionString: server.url });
    const cols = (await other.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('shops','ops') ORDER BY 1, 2`)).rows
      .map(r => `${r.table_name}.${r.column_name}`);
    expect(cols).toEqual(['ops.ct', 'ops.dev', 'ops.received_at', 'ops.seq', 'ops.shop_id', 'shops.created_at', 'shops.id', 'shops.last_seen', 'shops.op_count', 'shops.token_hash']);
    await other.end();
  });

  it('the database enforces its own constraints', async () => {
    await expect(store.pool.query(`INSERT INTO shops (id, token_hash) VALUES ('nothex', '\\x00')`)).rejects.toThrow(/check constraint/);
    await expect(store.pool.query(`INSERT INTO ops (shop_id, dev, seq, ct) VALUES ('${'a'.repeat(32)}', 'dev1', 1, 'x')`)).rejects.toThrow(/foreign key/);
  });

  it('health reports the database', async () => {
    expect((await app.inject('/health')).json()).toEqual({ ok: true, storage: 'postgres', database: 'up' });
  });
});
