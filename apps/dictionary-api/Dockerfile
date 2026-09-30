ARG NODE_IMAGE=node:22.16.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/dictionary-api/package.json apps/dictionary-api/
COPY packages/dictionary-core/package.json packages/dictionary-core/
RUN pnpm install --frozen-lockfile --filter zenbujapanese-dictionary-api...
COPY packages/dictionary-core packages/dictionary-core
COPY apps/dictionary-api apps/dictionary-api
RUN pnpm --filter zenbujapanese-dictionary-api build \
  && pnpm --filter zenbujapanese-dictionary-api deploy --legacy --prod /service

FROM ${NODE_IMAGE} AS sudachi
WORKDIR /fetch
COPY apps/ios/Modules/Sources/SearchExperience/Resources/LanguageTechnologyPackCatalog.json resources/
COPY apps/dictionary-api/scripts/fetch-sudachi.mjs .
RUN node fetch-sudachi.mjs resources /sudachi/system_core.dic

FROM ${NODE_IMAGE}
LABEL org.opencontainers.image.source="https://github.com/serpcompany/zenbujapanese-monorepo" \
  org.opencontainers.image.description="The zenbujapanese.com dictionary service (apps/dictionary-api)"
ENV NODE_ENV=production \
  PORT=8788 \
  DICTIONARY_RESOURCES=/service/resources \
  SUDACHI_DICTIONARY=/service/sudachi/system_core.dic
WORKDIR /service
COPY --from=build /service/node_modules node_modules
COPY --from=build /repo/apps/dictionary-api/dist dist
COPY --from=sudachi /sudachi sudachi
COPY apps/ios/Modules/Sources/SearchExperience/Resources/LanguageReferenceData.sqlite3 \
  apps/ios/Modules/Sources/SearchExperience/Resources/CompoundPitch.sqlite3 \
  apps/ios/Modules/Sources/SearchExperience/Resources/JLPTLevelPack.sqlite3 \
  apps/ios/Modules/Sources/SearchExperience/Resources/TUBELEXFrequencyPack.sqlite3 \
  apps/ios/Modules/Sources/SearchExperience/Resources/KanjiStrokeData.sqlite3 \
  apps/ios/Modules/Sources/SearchExperience/Resources/ExampleWordIndex.sqlite3 \
  apps/ios/Modules/Sources/SearchExperience/Resources/KanjiReferenceData.json \
  apps/ios/Modules/Sources/SearchExperience/Resources/KanjiElementReferenceData.json \
  apps/ios/Modules/Sources/SearchExperience/Resources/LanguageTechnologyPackCatalog.json \
  resources/
COPY apps/ios/Modules/Sources/SearchExperience/Resources/Kuromoji resources/Kuromoji
ARG RELEASE=unknown
ENV DICTIONARY_API_RELEASE=${RELEASE}
USER node
EXPOSE 8788
HEALTHCHECK --interval=15s --timeout=3s --start-period=60s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server.mjs"]
