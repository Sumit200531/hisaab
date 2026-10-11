import type { FastifyInstance } from 'fastify';
import type { Transport } from '@hisaab/core';

/** A sync transport that calls the Fastify app in-process (no sockets). */
export function injectTransport(app: FastifyInstance, onRequest?: (path: string, body: unknown) => void): Transport {
  const call = async (path: string, body: unknown) => {
    onRequest?.(path, body);
    const r = await app.inject({ method: 'POST', url: path, payload: body as object });
    const json = r.json();
    if (r.statusCode >= 400) throw Object.assign(new Error(json.error?.message ?? 'error'), { status: r.statusCode, code: json.error?.code });
    return json;
  };
  return {
    pull: (shop, token, vv, limit) => call(`/v1/shops/${shop}/pull`, { token, vv, limit }),
    push: (shop, token, ops) => call(`/v1/shops/${shop}/push`, { token, ops })
  };
}
