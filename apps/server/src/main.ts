import { buildApp } from './app.js';
import { MemoryStore, PgStore, migrate, type Store } from './store.js';

const port = Number(process.env.PORT ?? 8788);
const host = process.env.HOST ?? '0.0.0.0';
let store: Store;
if (process.env.DATABASE_URL) {
  const pg = PgStore.fromUrl(process.env.DATABASE_URL);
  const applied = await migrate(pg.pool);
  if (applied.length) console.log(`migrations applied: ${applied.join(', ')}`);
  store = pg;
} else {
  console.warn('DATABASE_URL not set: using in-memory storage (data is lost on restart).');
  store = new MemoryStore();
}
const app = await buildApp({
  store,
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : true,
  maxOpsPerShop: Number(process.env.MAX_OPS_PER_SHOP ?? 200_000),
  rateLimit: { perMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120) },
  logLevel: process.env.LOG_LEVEL ?? 'info'
});
const stop = async () => { await app.close(); await store.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
await app.listen({ port, host });
console.log(`Hisaab relay on http://${host}:${port} (storage: ${store.kind})`);
