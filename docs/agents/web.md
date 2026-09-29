# Website working guide

`apps/web` is zenbujapanese.com: Next.js served from Cloudflare Workers through OpenNext, with
Cloudflare D1 through Drizzle. It owns its toolchain (pnpm, its own lockfile) per ADR 0005. Run
every command below from `apps/web`. Decisions and scope live in issue #402.

The website follows these SERP engineering standards:

- [Drizzle + D1 data promotion](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/database-management-promotion-drizzle-d1.md)
- [Environment configuration](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/environment-configuration.md)
- [URL trailing slash](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/url-trailing-slash.md):
  pages end with a slash (`/about/`); files never do (`/robots.txt`, `/sitemap-index.xml`). The
  other form redirects (308) to it. `src/lib/pages.ts` is the single list of static page paths.

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
- `scripts/smoke.sh <base-url> <staging|production>` checks a running site's key pages, the
  `/privacy` redirect, and that environment's search-engine rules.

After changing routes, open the changed pages in `pnpm preview` and confirm `/sitemap-index.xml`
lists every child sitemap and each child sitemap lists the new URLs.

## Dictionary search

`src/lib/dictionary/search/` ports the app's Search retrieval to TypeScript and runs on D1. It
must return what the app returns: the ADR 0006 conformance suite
(`apps/ios/LanguageData/Conformance/search-retrieval.json`) checks it.

### Release databases

The dictionary's data lives in release databases (issue 464): D1s the website only reads, each
imported whole for one build of the dictionary. There are two, each with its own schema,
migrations, schema dump, binding, and import steps, described by
`scripts/release-d1/<database>/database.sh`:

| Database | Binding | Schema | Migrations | Local build |
| --- | --- | --- | --- | --- |
| `search` | `SEARCH_DB` | `src/db/search-schema.ts` | `drizzle/search/` | `.search-d1/` |
| `dictionary` | `DICTIONARY_DB` | `src/db/dictionary-schema.ts` | `drizzle/dictionary/` | `.dictionary-d1/` |

The dictionary database, for word and kanji pages, has its schema but can't be imported yet:
its scripts stop before touching D1, and only local development binds `DICTIONARY_DB`.

Each build gets a fresh D1, named `zenbujapanese-<database>-<env>-<build id>`. The build ID
(`scripts/release-d1/build-id.sh <database>`) hashes everything that shapes the database: the
artifact's SHA-256 from its Git LFS pointer, the database's migrations, schema, and other inputs
(for search, the search core, which precomputes its cache), the shared scripts in
`scripts/release-d1/`, and the database's own scripts, but not another database's.
`scripts/release-d1/ensure-release.sh <database> <env>` imports it:

1. Build a local copy with `load-local.sh <database>`: the migrations from empty, the
   database's rows, and `dictionary_import` last. For search, the rows are `build-rows.py`'s and
   the precomputed broad queries.
2. Check that copy: for search, run the conformance suite against it. Nothing reaches D1 unless
   it passes.
3. Create the D1, apply the migrations, and load the same files. A failed load deletes the new
   database.
4. Verify it before anything binds it: `dictionary_import` names this build, `d1_migrations`
   matches the migrations, the schema matches the schema dump (such as
   `src/db/search-schema.sql`), and every table holds the rows the local copy counted.

A database that already verifies is reused, so an unchanged build costs a deploy a few seconds.
A partial one is deleted and imported again. Once a deploy passes its smoke test,
`scripts/release-d1/prune.sh <database> <env> <live database>` deletes that database's older
builds, keeping the live one and the newest complete older one, so rolling back is redeploying
the previous commit. It keeps any build whose import it can't check. The `Release database`
workflow runs the import by hand for either database and environment.

### The search database

Search reads its own release database, bound as `SEARCH_DB`. `Web deploy` imports it for staging
before each deploy and binds `SEARCH_DB` to the database it names, by replacing the
`SEARCH_DB_*` placeholders in `wrangler.jsonc`. Production has no `SEARCH_DB` yet: it gets one
once a required reviewer gates the `production` environment.

**Broad queries are precomputed.** On D1, a query such as い reads 460,276 rows and takes 1.4–3.4
s, and D1 runs one query at a time per database, so a few of them stall every other query. The
import runs about 19,000 candidates (`search/candidates.py`) through the core on the local copy and
stores the results of those that read over 20,000 rows in `search_cache` (about 280 queries, 9
MB). `websiteSearch` reads the list of cached queries once per isolate, answers those from
`search_cache` in about 30 ms, and runs the core for everything else. The measurements are on
issue 464, from the `Search D1 benchmark` workflow.

### Schema and migrations

`src/db/search-schema.ts` holds the search tables, a projection of the app's database: IDs are
lowercase hex text. `drizzle.search.config.ts` generates migrations into `drizzle/search/`. The
FTS5 indexes, which Drizzle can't declare, are in the custom migration
`drizzle/search/0001_fts.sql`. `src/db/search-schema.sql` records the whole schema the migrations
build, including FTS5's shadow tables.

1. Change `src/db/search-schema.ts`, or add a custom migration with `pnpm exec drizzle-kit
   generate --config drizzle.search.config.ts --custom`.
2. Run `pnpm db:generate:search`, which also rewrites `src/db/search-schema.sql`. Review both.
3. Rebuild locally and run the suite.

`pnpm db:check` fails when the schema has changes no migration covers, or when the migrations'
schema differs from `src/db/search-schema.sql`. Never `drizzle-kit push` or `pull` the search
database: they don't know the FTS5 tables. The import refuses an artifact whose `transform` it
doesn't list in `scripts/release-d1/search/build-rows.py`.

D1 rejects the app's FTS4 indexes, so they are FTS5. `fts.ts` translates the app's FTS4 queries
so both match the same rows, and `form_chars` indexes Japanese forms by character in place of the
app's scan over every form. One difference remains: FTS4's stemmer shortens long numbers, so the
app finds glosses for a query such as 9999999 that the website doesn't.

### The dictionary database

Word and kanji pages will read their own release database, bound as `DICTIONARY_DB` (issue 464,
phase 2), so broad searches never queue in front of them. `src/db/dictionary-schema.ts` holds
its tables, named for the rows the detail core reads (`src/lib/dictionary/detail/rows.ts`):
`words` by `ent_seq`, `kanji` by the exact character, stroke order, kanji structure and
elements, example sentences with each word's examples (at most 100, in the app's order), retired
IDs, and `dictionary_import`, which also records each input file's SHA-256. Display-only data is
JSON. It has no FTS tables.

It changes the way the search schema does, with its own commands:
`pnpm db:generate:dictionary` generates a migration into `drizzle/dictionary/` and rewrites
`src/db/dictionary-schema.sql`, and `pnpm db:check` checks it too.

### Run the suite locally

Build the search database into `.search-d1/` (about 8 minutes, most of it precomputing), then run
the tests:

```sh
scripts/release-d1/load-local.sh search [path/to/LanguageReferenceData.sqlite3]
ZENBU_SEARCH_D1=1 pnpm test
```

The script defaults to the app's bundled database and replaces `.search-d1/` only after a build
succeeds. The suite stops at once when `.search-d1/` wasn't built from the artifact it pins.
Without `ZENBU_SEARCH_D1=1`, `pnpm test` skips the suite.

The search core takes capabilities a client supplies (ADR 0008). The website, configured in
`website.ts`, supplies none, so it has no sentence search. Like the app, `search()` throws when
the database fails or an English query can't be read as full text, such as one with a NUL.

The search results page reads it through `searchDictionary` in `src/lib/dictionary/data.ts`. A
query full-text search can't read (an FTS5 error, `isUnreadableQuery`) shows no results; any other
failure fails the request, so an outage never renders as an empty, noindexed page. When
`SEARCH_DB` is unbound or holds no finished import (no `dictionary_import` row), as in `pnpm dev`,
it searches the fixtures instead. `load-local.sh` builds into `.search-d1/`, which `pnpm dev`
doesn't read. Until word pages read D1 (#465), only results with a fixture word page link.

## Word and kanji pages

`src/lib/dictionary/detail/` is the detail core: pure functions, `wordDetail(rows)` and
`kanjiDetail(rows)`, that turn rows shaped like the planned dictionary D1 (`detail/rows.ts`)
into what the word and kanji pages render. Each function is a port of the app's Swift and names
its source, so the pages show what the app shows: furigana, pitch, the first sense's part of
speech, frequency from the app's default dictionaries (JLPT and TUBELEX), a kanji's 24 words and
their order, and element roles. `data.ts` runs the core and adds only URLs.

Until the dictionary D1 exists (#465), the rows are local fixtures in
`src/lib/dictionary/fixtures/`, exported from the app's bundled data by
`scripts/export-dictionary-fixtures.py` so their shapes can't drift. Rerun it after changing a
row shape; the fixture JSON is generated, so Biome skips it.

## Environments and deploys

| Environment | Worker | Domain | D1 database |
| --- | --- | --- | --- |
| Local | — | `localhost` | `zenbujapanese-web-local` (local only) |
| Staging | `zenbujapanese-web-staging` | `staging.zenbujapanese.com` | `zenbujapanese-web-staging` |
| Production | `zenbujapanese-web-production` | `zenbujapanese.com` (`www` redirects to it) | `zenbujapanese-web-production` |

Deploys and remote migrations run only through the `Web deploy` GitHub Actions workflow, never
from an agent's machine. Each merge to `main` that changes `apps/web/**` applies staging
migrations, deploys staging, and smoke-tests its workers.dev URL (`scripts/smoke.sh`). The production job then
runs automatically once staging passes: it applies production migrations, deploys the same commit,
and smoke-tests its workers.dev URL. Staging's smoke tests are the gate; the `production` GitHub
environment has no required reviewer for now. Add one (Settings → Environments → production) once
production data migrations begin, such as with the dictionary. Both environments deploy only from
`main`.
The workflow uses the `CLOUDFLARE_API_TOKEN` secret (the "Edit Cloudflare Workers" template plus D1 Edit, limited
to the SERP account and the zenbujapanese.com zone) and the `CLOUDFLARE_ACCOUNT_ID` variable.

The `deploy:*` and remote `db:migrate:*` scripts remain for a human-run emergency only.

### Environment configuration

Each value that differs by environment lives where the code that reads it runs:

- **Worker `vars` in `wrangler.jsonc`**, per environment, for anything rendered on request. OpenNext
  renders routes such as `robots.txt` inside the Worker, where build-time variables are absent.
- **The build**, for static pages and `next.config` headers, which are rendered once at build
  time. `deploy:production` sets these.
- **`wrangler secret put --env <env>`** for secrets. **`.dev.vars`** holds local values only and is
  never committed.

`SITE_ENV=production` is set in both the production Worker `vars` and the `deploy:production`
build. Anything else is non-production: it sends `X-Robots-Tag: noindex` and a `robots.txt` that
disallows everything. Analytics load only in production and only when their build-time IDs are
set: `NEXT_PUBLIC_GTM_ID` (Google Tag Manager, a `production` GitHub environment variable that
the `Web deploy` workflow passes to the production build) and `NEXT_PUBLIC_CF_BEACON_TOKEN` (Cloudflare Web
Analytics).

Before merging a change to environment configuration, build without the variable and run the
Worker with the target environment's `vars` (`pnpm exec opennextjs-cloudflare preview --env
production`), then check the output. `scripts/smoke.sh <url> <staging|production>` asserts the
search-engine rules for each environment, so CI fails if production is hidden or staging is
exposed.

### Canonical hosts

Each environment has one canonical host: `zenbujapanese.com` for production and
`staging.zenbujapanese.com` for staging. Every other host serving the same Worker permanently
redirects (308) to it in one hop, keeping the canonical trailing-slash form, through
`redirectHostTo` in `next.config.ts`:

- `www.zenbujapanese.com`, a custom domain on the production Worker.
- Each Worker's workers.dev URL. Wrangler enables it by default; left alone it serves a crawlable
  duplicate of the site.

The zone is on the free plan, whose Bot Fight Mode blocks CI runners and cannot be skipped by WAF
rules, so CI smoke-tests the workers.dev URLs with the `x-zenbu-smoke-test` header, which exempts a
request from the host redirect. The header is not a secret. `scripts/smoke.sh` also checks, with a
retry for edge propagation, that a plain workers.dev request 308s to the canonical host.

When adding a host (a new custom domain, preview URLs), add a `redirectHostTo` rule and a smoke
check in the same change. To test host rules locally, run `wrangler dev` without `--env production`
and send a `Host` header: with that environment's custom domains, Wrangler rewrites `Host` to the
route's domain and host rules never match.

`/privacy` and `/support` must keep working: the shipped iOS app and App Store metadata link to
them.

Email Routing on the zone forwards `support@zenbujapanese.com` to `support+zenbujapanese@serp.co`
and `dmca@zenbujapanese.com` to `dmca+zenbujapanese@serp.co`.

## Database

D1 follows the SERP [Drizzle + D1 standard](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/database-management-promotion-drizzle-d1.md).
This section covers the site's database, `DB`; the dictionary search database, `SEARCH_DB`, has
its own schema and migrations and is imported per build (see Dictionary search). All three
environments' site databases share the `DB` binding, the schema in `src/db/schema.ts`, the
migrations in `drizzle/`, and the `d1_migrations` ledger table. Staging and production are targeted through
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
