ARG NODE_IMAGE=node:22.16.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/account-api/package.json apps/account-api/
COPY packages/node-service/package.json packages/node-service/
RUN pnpm install --frozen-lockfile --filter zenbujapanese-account-api...
COPY packages/node-service packages/node-service
COPY apps/account-api apps/account-api
RUN pnpm --filter zenbujapanese-account-api build

FROM ${NODE_IMAGE}
LABEL org.opencontainers.image.source="https://github.com/serpcompany/zenbujapanese-monorepo" \
  org.opencontainers.image.description="Zenbu accounts, sign-in, and sync (apps/account-api)"
ENV NODE_ENV=production \
  PORT=8789
WORKDIR /service
COPY --from=build /repo/apps/account-api/dist dist
COPY apps/account-api/migrations migrations
ARG RELEASE=unknown
ENV ACCOUNT_API_RELEASE=${RELEASE}
USER node
EXPOSE 8789
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/server.mjs"]
