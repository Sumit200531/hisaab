import EmbeddedPostgres from 'embedded-postgres';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const freePort = () => new Promise<number>((res, rej) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); });
  s.on('error', rej);
});

/** TEST_DATABASE_URL (e.g. CI's postgres service) or a throw-away real PostgreSQL via embedded-postgres. */
export async function startPostgres(): Promise<{ url: string; stop: () => Promise<void> }> {
  if (process.env.TEST_DATABASE_URL) return { url: process.env.TEST_DATABASE_URL, stop: async () => {} };
  const dir = mkdtempSync(join(tmpdir(), 'hisaab-pg-'));
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: dir, user: 'hisaab', password: 'hisaab', port, persistent: false,
    createPostgresUser: typeof process.getuid === 'function' && process.getuid() === 0,
    onLog: () => {}, onError: () => {}
  });
  await pg.initialise(); await pg.start(); await pg.createDatabase('hisaab_test');
  return { url: `postgres://hisaab:hisaab@127.0.0.1:${port}/hisaab_test`, stop: async () => { await pg.stop(); rmSync(dir, { recursive: true, force: true }); } };
}
