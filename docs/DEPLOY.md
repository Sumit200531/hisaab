# Deploying Hisaab

There are two independent pieces. The app works without the relay; the relay only adds syncing between phones.

## 1. The app on GitHub Pages (free)

1. Push the repository to GitHub.
2. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`, or run the **Deploy app to GitHub Pages** workflow by hand.

The app is served at `https://<user>.github.io/hisaab/`. It uses relative paths, so it works under any sub-path.

## 2. The sync relay on Render + Neon (free)

1. Create a free PostgreSQL database on [neon.tech](https://neon.tech) and copy its connection string (`postgres://…?sslmode=require`).
2. On [render.com](https://render.com), choose **New → Blueprint** and pick this repository. Render reads `render.yaml`.
3. Set `DATABASE_URL` to the Neon string. Set `CORS_ORIGIN` to the origin of your app, for example `https://sumit200531.github.io`.
4. When the service is live, `https://<name>.onrender.com/health` returns `{"ok":true,"storage":"postgres","database":"up"}`. Migrations run automatically at startup.
5. In the GitHub repo, open **Settings → Secrets and variables → Actions → Variables** and add `RELAY_URL` = `https://<name>.onrender.com`. Then re-run the Pages workflow, so new users get sync pre-filled. Users can always change the server in the app.

Free Render services sleep when idle. The first sync after a pause can take around 30 seconds, and the app shows that as a normal sync that takes longer. Because sync is optional and the phone is always the source of truth, nothing is lost while the relay sleeps.

### Other hosts

The relay is a single container (`apps/server/Dockerfile`, built from the repository root), so any container host works:

```bash
docker build -f apps/server/Dockerfile -t hisaab-relay .
docker run -p 8788:8788 -e DATABASE_URL=postgres://... -e CORS_ORIGIN=https://you.github.io hisaab-relay
```

| Variable | Default | Meaning |
|---|---|---|
| `PORT` / `HOST` | `8788` / `0.0.0.0` | listen address |
| `DATABASE_URL` | none | PostgreSQL; unset = in-memory (testing only) |
| `CORS_ORIGIN` | any | comma-separated allowed origins |
| `MAX_OPS_PER_SHOP` | `200000` | per-shop storage quota |
| `RATE_LIMIT_PER_MINUTE` | `120` | per IP |
| `LOG_LEVEL` | `info` | Fastify log level or `silent` |

## API

The relay has three routes, all JSON:

| Route | Body | Result |
|---|---|---|
| `GET /health` | none | `{ ok, storage, database }` |
| `POST /v1/shops/:shopId/push` | `{ token, ops: [{ dev, seq, ct }] }` (1–500 ops) | `{ stored, quota }`. Creates the shop on first push and records the token's hash. |
| `POST /v1/shops/:shopId/pull` | `{ token, vv: { dev: seq }, limit }` | `{ ops, more, vv }`. Returns ops with `seq > vv[dev]`, plus the relay's contiguous vector. |

**Errors.** Every error has the shape `{ "error": { "code", "message" } }`:
- `400` invalid request;
- `403` the token doesn't match the shop;
- `404` unknown route;
- `429` rate limit;
- `507` quota reached.
