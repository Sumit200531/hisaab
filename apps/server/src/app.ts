import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { z, ZodError } from 'zod';
import type { Store } from './store.js';

export interface AppOptions {
  store: Store;
  corsOrigin?: string[] | true;
  maxOpsPerShop?: number;
  rateLimit?: { perMinute: number };
  logLevel?: string;
}

class HttpError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }

const ShopId = z.string().regex(/^[0-9a-f]{32}$/, 'invalid shop id');
const Token = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'invalid token');
const Dev = z.string().regex(/^[a-z0-9]{4,16}$/);
const EnvelopeSchema = z.object({ dev: Dev, seq: z.number().int().min(1).max(2_000_000_000), ct: z.string().regex(/^[A-Za-z0-9_-]+$/).min(40).max(8192) }).strict();
const PushBody = z.object({ token: Token, ops: z.array(EnvelopeSchema).min(1).max(500) }).strict();
const PullBody = z.object({
  token: Token,
  vv: z.record(Dev, z.number().int().min(0)).refine(v => Object.keys(v).length <= 200, 'too many devices').default({}),
  limit: z.number().int().min(1).max(1000).default(500)
}).strict();

/** A tiny fixed-window limiter per client IP: enough to stop a runaway client or a scraper. */
function limiter(perMinute: number) {
  const hits = new Map<string, { n: number; window: number }>();
  return (ip: string) => {
    const w = Math.floor(Date.now() / 60_000);
    const h = hits.get(ip);
    if (!h || h.window !== w) { hits.set(ip, { n: 1, window: w }); if (hits.size > 50_000) hits.clear(); return true; }
    return ++h.n <= perMinute;
  };
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logLevel && opts.logLevel !== 'silent' ? { level: opts.logLevel } : false, bodyLimit: 2 * 1024 * 1024, trustProxy: true });
  const { store } = opts;
  const maxOps = opts.maxOpsPerShop ?? 200_000;
  const allow = opts.rateLimit ? limiter(opts.rateLimit.perMinute) : null;

  await app.register(cors, { origin: opts.corsOrigin ?? true, methods: ['GET', 'POST'] });

  app.addHook('onRequest', async (req) => {
    if (allow && req.url.startsWith('/v1/') && !allow(req.ip)) throw new HttpError(429, 'rate_limited', 'Too many requests; try again in a minute.');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) return reply.status(400).send({ error: { code: 'invalid_request', message: err.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') } });
    if (err instanceof HttpError) return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: { code: 'bad_request', message: err.message } });
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'Internal server error' } });
  });

  app.get('/health', async () => ({ ok: true, storage: store.kind, database: store.kind === 'postgres' ? (await store.ping() ? 'up' : 'down') : 'n/a' }));

  const auth = async (shop: string, token: string, create: boolean) => {
    const r = await store.authorize(shop, token, create);
    if (r === 'denied') throw new HttpError(403, 'forbidden', 'This sync code does not match the shop.');
    return r;
  };

  app.post('/v1/shops/:shop/push', async (req) => {
    const shop = ShopId.parse((req.params as { shop: string }).shop);
    const body = PushBody.parse(req.body);
    await auth(shop, body.token, true);
    const r = await store.push(shop, body.ops, maxOps);
    if (r.quota && r.stored === 0) throw new HttpError(507, 'quota', `This shop has reached the limit of ${maxOps} entries on the relay.`);
    return { stored: r.stored, quota: r.quota };
  });

  app.post('/v1/shops/:shop/pull', async (req) => {
    const shop = ShopId.parse((req.params as { shop: string }).shop);
    const body = PullBody.parse(req.body);
    const r = await auth(shop, body.token, false);
    if (r === 'unknown') return { ops: [], more: false, vv: {} };   // nothing pushed yet
    return store.pull(shop, body.vv, body.limit);
  });

  app.setNotFoundHandler((req, reply) => reply.status(404).send({ error: { code: 'not_found', message: `No route ${req.method} ${req.url}` } }));
  return app;
}
