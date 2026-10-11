# Hisaab relay. Build from the repository root:  docker build -f apps/server/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts
COPY packages/core packages/core
COPY apps/server apps/server
RUN npm run build -w @hisaab/server

FROM node:22-alpine
ENV NODE_ENV=production PORT=8788 HOST=0.0.0.0
WORKDIR /app
RUN npm install --omit=dev --no-package-lock fastify@5.2.1 @fastify/cors@10.0.2 pg@8.13.1 zod@3.24.1 && npm cache clean --force
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/migrations ./migrations
USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8788/health || exit 1
CMD ["node", "dist/main.js"]
