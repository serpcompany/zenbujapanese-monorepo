# Website working guide

`apps/web` is zenbujapanese.com: Next.js served from Cloudflare Workers through OpenNext, with
Cloudflare D1 through Drizzle. It owns its toolchain (pnpm, its own lockfile) per ADR 0005. Run
every command below from `apps/web`. Decisions and scope live in issue #402.

Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/`; this
Next.js version differs from older releases (see `apps/web/AGENTS.md`).

## Run and verify

- `pnpm dev` runs Next.js in Node, with Cloudflare bindings (the local D1 database) available
  through `getCloudflareContext()`.
- `pnpm preview` builds with OpenNext and serves the Worker in workerd, the production runtime.
  Check routes, redirects, and headers there before deploying.
- `pnpm check` runs Biome, typecheck, `drizzle-kit check` (migration validation), Vitest, and
  `next build`. The `Web` GitHub Actions workflow
  runs it on pull requests that change `apps/web/**`.
- `scripts/smoke.sh <base-url>` checks a running site's key pages and the `/privacy` redirect.

After changing routes, open the changed pages in `pnpm preview` and confirm `/sitemap-index.xml`
lists every child sitemap and each child sitemap lists the new URLs.

## Environments and deploys

| Environment | Worker | Domain | D1 database |
| --- | --- | --- | --- |
| Local | — | `localhost` | `zenbujapanese-web-local` (local only) |
| Staging | `zenbujapanese-web-staging` | `staging.zenbujapanese.com` | `zenbujapanese-web-staging` |
| Production | `zenbujapanese-web-production` | `zenbujapanese.com` (after cutover) | `zenbujapanese-web-production` |

Deploys and remote migrations run only through the `Web deploy` GitHub Actions workflow, never
from an agent's machine. Each merge to `main` that changes `apps/web/**` applies staging
migrations, deploys staging, and smoke-tests its workers.dev URL (`scripts/smoke.sh`). The production job then
waits for approval on the `production` GitHub environment, applies production migrations, deploys
the same commit, and smoke-tests its workers.dev URL. Both environments deploy only from `main`.
The workflow uses the `CLOUDFLARE_API_TOKEN` secret (the "Edit Cloudflare Workers" template plus D1 Edit, limited
to the SERP account and the zenbujapanese.com zone) and the `CLOUDFLARE_ACCOUNT_ID` variable.

The `deploy:*` and remote `db:migrate:*` scripts remain for a human-run emergency only.

Only `deploy:production` builds with `SITE_ENV=production`. Every other build sends
`X-Robots-Tag: noindex` and a `robots.txt` that disallows everything, so staging never reaches
search engines. Analytics also load only in production builds, and only when their build-time IDs
are set: `NEXT_PUBLIC_GTM_ID` (Google Tag Manager) and `NEXT_PUBLIC_CF_BEACON_TOKEN` (Cloudflare
Web Analytics).

Production serves its workers.dev URL until DNS moves off the placeholder GitHub Pages site
(`serpcompany/zenbujapanese.com`). At cutover, add custom domains for `zenbujapanese.com` and
`www.zenbujapanese.com` in `wrangler.jsonc`, and update the `production` environment's
`WEB_PRODUCTION_URL` variable. Keep `workers_dev` on: the zone's bot protection blocks CI runners, so
smoke tests use the workers.dev URLs, while people review on the branded domains. `/privacy` and `/support` must keep working: the
shipped iOS app and App Store metadata link to them.

## Database

D1 follows the SERP [Drizzle + D1 standard](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/database-management-promotion-drizzle-d1.md).
All three databases share the `DB` binding, the schema in `src/db/schema.ts`, the migrations in
`drizzle/`, and the `d1_migrations` ledger table. Staging and production are targeted through
named Wrangler environments (`--env staging`, `--env production`) rather than `--preview`, so each
has its own Worker and domain. Local uses seeded fixture data, staging controlled fixtures, and
production real data only.

1. Change `src/db/schema.ts`, then run `pnpm db:generate` and review the SQL.
2. `pnpm db:migrate:local`, then verify with `pnpm dev` or `pnpm preview`.
3. `pnpm db:migrate:staging`, then verify staging.
4. `pnpm db:migrate:production`.

Each script names its target database explicitly; `db:migrations:list:<env>` shows what is
applied. Never run `drizzle-kit push` against a shared database, and never seed production.
After changing bindings in `wrangler.jsonc`, run `pnpm cf-typegen`.

## Sitemaps

Sitemaps are hand-written route handlers built on `src/lib/sitemap.ts`. `/sitemap-index.xml` is
the index (`/sitemap.xml` serves the same document) and lists every child sitemap under
`/sitemaps/`. A child sitemap holds at most 50,000 URLs. Add a new section's sitemap to
`childSitemaps`. Static pages are listed once, in `src/lib/pages.ts`, which also feeds the HTML
sitemap at `/sitemap`.
