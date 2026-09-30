# Website working guide

`apps/web` is zenbujapanese.com: Next.js served from Cloudflare Workers through OpenNext, with
Cloudflare D1 through Drizzle for the site's own data. It reads the dictionary from the
dictionary service (`apps/dictionary-api`, ADR 0009; see
[`dictionary-api.md`](dictionary-api.md)). It builds with pnpm in the repository's workspace (the
root `pnpm-workspace.yaml` and lockfile), which it shares with the dictionary core
(`packages/dictionary-core`) and the service, and still owns its build, tests, and deploys
(ADR 0005). Run every command below from `apps/web`. Decisions and scope live in issue #402.
What the dictionary pages show, and the check that enforces each behavior, is in
[`apps/web/docs/product/`](../../apps/web/docs/product/index.md).

The website follows these SERP engineering standards:

- [Drizzle + D1 data promotion](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/database-management-promotion-drizzle-d1.md)
- [Environment configuration](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/environment-configuration.md)
- [URL trailing slash](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/url-trailing-slash.md):
  pages end with a slash (`/about/`); files never do (`/robots.txt`, `/sitemap-index.xml`). The
  other form redirects (308) to it. `src/lib/pages.ts` is the single list of static page paths.

Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/`; this
Next.js version differs from older releases (see `apps/web/AGENTS.md`).

## Run and verify

- `pnpm dev` runs Next.js in Node, with Cloudflare bindings (the local D1 database, and
  `.dev.vars`) available through `getCloudflareContext()`. Dictionary pages show local fixtures
  unless `.dev.vars` names a dictionary service (see Dictionary).
- `pnpm preview` builds with OpenNext and serves the Worker in workerd, the production runtime.
  Check routes, redirects, and headers there before deploying.
- `pnpm check` runs Biome, typecheck, `drizzle-kit check` (migration validation), Vitest, and
  `next build`. The `Web` GitHub Actions workflow runs it on pull requests that change
  `apps/web/**` or the core.
- `scripts/smoke.sh <base-url> <staging|production>` checks a running site's key pages, the
  `/privacy` redirect, that environment's search-engine rules, and dictionary pages against the
  app-recorded suites.

After changing routes, open the changed pages in `pnpm preview` and confirm `/sitemap-index.xml`
lists every child sitemap and each child sitemap lists the new URLs.

## Dictionary

Every search, word, kanji, example, sitemap, and retired entry comes from the dictionary service,
which runs the shared core on the app's own artifact (ADR 0009). Nothing is precomputed or
imported: a new build of the dictionary is a new service image, and the site needs no deploy for
it. Pages read the service only through `src/lib/dictionary/data.ts`, which runs the core's detail
functions over the rows the service answers with and adds only the site's URLs.

`src/lib/dictionary/api.ts` is the service's client. It sends the `DICTIONARY_API_TOKEN` secret as
a bearer token to `DICTIONARY_API_URL` and keeps each answer in the Worker's edge cache (the Cache
API) for 10 minutes, keyed without the token; `pnpm dev` has no such cache. The service names the
build that answered (`X-Dictionary-Build`: the artifact's SHA-256 prefix and the service's
release), and URLs that load more of a page's list carry it, so a page open across a new build
never mixes two builds' lists. A 404 means "not there" (no such word, kanji, or sitemap, or a
search without examples); any other failure fails the request, so an outage never renders as an
empty or noindexed page. A query or form over the service's 200 characters
(`maximumQueryLength`) finds nothing without asking it.

Only local development falls back to fixtures, when no `DICTIONARY_API_URL` is set, as in
`pnpm dev` by default. Staging and production (`SITE_ENV` set) always name a service, and there a
missing one fails the request rather than passing fixtures off as the dictionary.

To run `pnpm dev` on the whole dictionary, start the service (see
[`dictionary-api.md`](dictionary-api.md)) and name it in `apps/web/.dev.vars`, which is never
committed:

```sh
DICTIONARY_API_URL=http://localhost:8788
DICTIONARY_API_TOKEN=<the token the service was started with>
```

### Search results

The service runs the search core (`packages/dictionary-core/src/search/`, the app's Search
retrieval with its own SQL on the artifact's FTS4 indexes) and the results core
(`packages/dictionary-core/src/results/`, ported from SearchView.swift and FrequencyPack.swift),
and answers with the results screen. `orderedItems` is
`SearchResultFrequencyOrdering.ordered`: within each match group (the result's source, then its
coarse match rank), the more common tier from the first dictionary that has one, then each
dictionary's value in priority order (lower first, ranked before unranked), then the retrieval
order, then the Language Reference ID. Discovered Words keep their order.
`searchResultsScreen` adds what `SearchResultsView` shows: the "View N Example Sentences" row, each
row's meaning (the matched meaning for an English query), its chips, the "Search for「…」" reading
refinement, the KANJI row that leads a one-kanji query with the meaning of the entry written as
that kanji (chosen before the re-sort, "Kanji detail" without one), and No Dictionary Matches.

The page's component, `components/dictionary/search-results.tsx`, only renders it, every word at
once (at most the app's 60). `results/links.ts` adds links (`linkSearchScreen`, shared by
`data.ts` and the rendered-page test) and decides indexing: a page is indexed only when it lists
a word or its kanji row opens a kanji page. A query full-text search can't read is answered as
finding nothing by the service.

With Sudachi, the service analyzes a sentence as the app does and lists its Discovered Words.
The Example Sentences row opens `/dictionary/search/<query>/examples/`: the query's sentences, or
its primary entry's for a romaji or deinflected query, 25 at first and the rest from
`examples.json` beside it. It's indexed only for a direct Japanese search
(`searchExamplesIndexable`, the SEO owner's decision on #511): a romaji or deinflected search lists
its primary entry's examples, which that word's page already has.

A broad query (い, "to") takes the service one to two seconds the first time, most of it the
app's own SQL, and a one-letter wildcard's Example Sentences (`t*`, over 100,000 sentences) up to
about five; the service and the edge cache keep the answer after that.

### Word and kanji pages

`packages/dictionary-core/src/detail/` is the detail core: pure functions, `wordDetail(rows)` and
`kanjiDetail(rows)`, that turn the service's rows (`detail/rows.ts`) into what the word and kanji
pages render. Each function is a port of the app's Swift and names its source, so the pages show
what the app shows (see the [product docs](../../apps/web/docs/product/dictionary.md)).

`getWordPage` and `getKanjiPage` ask the service once per page. The answer names the slug of
every word the page links to and which kanji have pages, so every link goes to a page that
exists. Word pages live under the slug the service names. A word page's later examples load from
`/dictionary/examples/<ent_seq>.json?build=<build>&from=<n>` (`getWordExamples`).

The part of speech opens the word's conjugation table in a sheet, as the app pushes it, and a
form's screen there loads all its examples from `/dictionary/conjugations/<form>.json` when it
opens. The table and each form also have their own pages, which the sheet links to
(`/dictionary/<slug>-<ent_seq>/conjugations/` and `…/conjugations/<plain|polite>/<kind>/`,
`getConjugationsPage` and `getConjugatedFormPage`): the service answers the word's rows without
examples, the detail core conjugates them, and a form's page lists its examples by spelling, 25
at first and the rest from `/dictionary/examples/forms/<form>.json?build=<build>&from=<n>`
(`getFormExamples`). The form routes read the spelling as written, since the app's form screen
searches it normalized but matches it as written (a full-width Ｈ).

Without a service, the rows are local fixtures in `packages/dictionary-core/src/fixtures/`,
exported from the app's bundled data by the service's own readers (`pnpm --filter
zenbujapanese-dictionary-api fixtures`), so their shapes can't drift; each fixture word and each
of its conjugated forms keeps its first 50 examples. Rerun it after changing a row shape; the
fixture JSON is generated, so Biome skips it.

### The rendered-page gate

The service's own tests replay the app-recorded suites (`apps/ios/LanguageData/Conformance/`)
through the core on the real artifact: search retrieval, search results, example search, word
detail, and kanji detail, every example field included (see
[`dictionary-api.md`](dictionary-api.md)). The site's gate then renders what a running service
answers through the pages' components with React's server renderer, and reads back what a reader
sees:

- `components/dictionary/search-results.test.tsx` renders seven search-results cases: sections,
  the Example Sentences row, the refinement, the kanji row, and each row's headword, meaning,
  chips, and link.
- `components/dictionary/search-examples.test.tsx` holds every recorded Example Sentences row to
  the page it opens (as many examples as its count promises, 25 first, and a Japanese query
  accented in each sentence), and renders eight example-search cases: every listed pair ID in
  order, loading each whole list as the page does, and the first sentences' words and marks.
- `components/dictionary/word-page.test.tsx` and `conjugations.test.tsx` draw every word-detail
  case: the per-kanji furigana split, the pitch graph's points, each Frequency row's details, and
  the conjugation table and each form's page, form by form, with the form's first examples.

`pnpm test` skips the gate. To run it, start the service and point the tests at it:

```sh
ZENBU_DICTIONARY_API=1 ZENBU_DICTIONARY_API_TOKEN=<token> pnpm exec vitest run src/components/dictionary
```

`ZENBU_DICTIONARY_API_URL` names another service (default `http://localhost:8788`). The
`Dictionary API` workflow runs the gate on pull requests against the service it builds, and
`smoke.sh` checks the deployed pages against the search-results suite's `iru` and `eat` cases, the
example-search suite's 見る, and the word-detail suite's 見る and 学校 at run time.

## Environments and deploys

| Environment | Worker | Domain | D1 database |
| --- | --- | --- | --- |
| Local | — | `localhost` | `zenbujapanese-web-local` (local only) |
| Staging | `zenbujapanese-web-staging` | `staging.zenbujapanese.com` | `zenbujapanese-web-staging` |
| Production | `zenbujapanese-web-production` | `zenbujapanese.com` (`www` redirects to it) | `zenbujapanese-web-production` |

Deploys and remote migrations run only through the `Web deploy` GitHub Actions workflow, never
from an agent's machine. Each merge to `main` that changes `apps/web/**` or the core points
staging at its dictionary service, applies staging migrations, deploys staging, and smoke-tests
its workers.dev URL (`scripts/smoke.sh`). The production job then runs automatically once staging
passes: it does the same for production with the same commit. Staging's smoke tests are the gate:
the `production` GitHub environment has no required reviewer, by the owner's decision. Add one
(Settings → Environments → production) to review production deploys by hand. Both environments
deploy only from `main`. Setting the repository variable `DEPLOY_PRODUCTION` to `false` pauses the
production job on pushes, so `main` deploys staging only; a manual run of `Web deploy` still
deploys production. The workflow uses the `CLOUDFLARE_API_TOKEN` secret (the "Edit
Cloudflare Workers" template plus D1 Edit, limited to the SERP account and the zenbujapanese.com
zone) and the `CLOUDFLARE_ACCOUNT_ID` variable.

The `deploy:*` and remote `db:migrate:*` scripts remain for a human-run emergency only.

### Dictionary service

Each deployed environment reads its own dictionary service:

- The GitHub environment's `DICTIONARY_API_URL` variable is the service's HTTPS origin, such as
  `https://dictionary.example.com`. `Web deploy` writes it over that environment's
  `DICTIONARY_API_URL` placeholder in `wrangler.jsonc`.
- The Worker's `DICTIONARY_API_TOKEN` secret is the token the service was started with. Set it by
  hand, and again to rotate it: `pnpm exec wrangler secret put DICTIONARY_API_TOKEN --env
  <staging|production>`.

`scripts/use-dictionary-service.sh` checks both, and that the service answers `/healthz`, before
the deploy; the smoke test's dictionary pages then prove the token works. Deploy a new service
before a site change that needs it: the site reads whatever service its environment names.

### Environment configuration

Each value that differs by environment lives where the code that reads it runs:

- **Worker `vars` in `wrangler.jsonc`**, per environment, for anything rendered on request. OpenNext
  renders routes such as `robots.txt` inside the Worker, where build-time variables are absent.
- **The build**, for static pages and `next.config` headers, which are rendered once at build
  time. `deploy:production` sets these.
- **`wrangler secret put --env <env>`** for secrets. **`.dev.vars`** holds local values only and is
  never committed.

`SITE_ENV=production` is set in both the production Worker `vars` and the `deploy:production` build.
Anything else is non-production: it sends `X-Robots-Tag: noindex` and a `robots.txt` that disallows
everything. Analytics load only in production and only when their build-time IDs are set:
`NEXT_PUBLIC_GTM_ID` (Google Tag Manager, a `production` GitHub environment variable that the
`Web deploy` workflow passes to the production build) and `NEXT_PUBLIC_CF_BEACON_TOKEN` (Cloudflare
Web Analytics).

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
The site's database, `DB`, holds the site's own data; the dictionary is not in D1 (see
Dictionary). All three environments' databases share the `DB` binding, the schema in
`src/db/schema.ts`, the migrations in `drizzle/`, and the `d1_migrations` ledger table. Staging
and production are targeted through named Wrangler environments (`--env staging`, `--env
production`) rather than `--preview`, so each has its own Worker and domain. Local uses seeded
fixture data, staging controlled fixtures, and production real data only.

1. Change `src/db/schema.ts`, then run `pnpm db:generate` and review the SQL.
2. `pnpm db:migrate:local`, then verify with `pnpm dev` or `pnpm preview`.
3. `pnpm db:migrate:staging`, then verify staging.
4. `pnpm db:migrate:production`.

Each script names its target database explicitly; `db:migrations:list:<env>` shows what is
applied. Never run `drizzle-kit push` against a shared database, and never seed production.
After changing bindings or vars in `wrangler.jsonc`, run `pnpm cf-typegen`.

## Sitemaps

Sitemaps are hand-written route handlers built on `src/lib/sitemap.ts`. `/sitemap-index.xml` is
the index (`/sitemap.xml` serves the same document) and lists every child sitemap under
`/sitemaps/`. A child sitemap holds at most 50,000 URLs. Add a new section's sitemap to
`childSitemaps`. Static pages are listed once, in `src/lib/pages.ts`, which also feeds the HTML
sitemap at `/sitemap`.

The dictionary's sitemaps (`src/lib/dictionary/sitemaps.ts`, ADR 0007) exist wherever the site
has a dictionary service, staging and production, not local fixtures, so the index renders per
request. `/dictionary/`, the search box, is a static page in `src/lib/pages.ts`:

- `/sitemaps/dictionary/<n>.xml`: every word page's canonical URL under its slug,
  percent-encoded, 50,000 to a file in `ent_seq` order (five files for 218,382 words). The
  service works out each file's `ent_seq` range once, and the site streams a file's words from it
  10,000 at a time.
- `/sitemaps/kanji.xml`: the kanji pages search engines may index: those with meanings or
  readings.
- `/sitemaps/conjugations.xml`: every conjugation table, then the form pages search engines may
  index: those that list examples, each under its canonical URL (33,532 URLs: 20,364 tables and
  13,168 forms, in one file). Which forms list examples, the service works out for every spelling
  at once when it starts, in the background (about half a minute); until then the sitemap answers
  503 with `Retry-After`, which search engines retry.

All three are kept in the Worker's edge cache (the Cache API) under the dictionary build the service
names, so they change with the build, within the 10 minutes its answers stay cached; `pnpm dev`
has no such cache.

## Retired word URLs

A word URL whose `ent_seq` the dictionary retired answers 410 or 308 (ADR 0007; the behavior is
in the [product docs](../../apps/web/docs/product/dictionary.md#urls-seo-and-indexing)). Next.js
pages can't answer 410, so `worker.ts`, the Worker's entry in `wrangler.jsonc`, answers these
before OpenNext's worker and passes every other request on (`src/lib/dictionary/retired.ts`). It
asks the service for the retired entries once per isolate, wherever the site has a service.
`pnpm dev` runs Next.js alone, so check retired URLs in `pnpm preview`. The service lists none
until #463 records retired entries.
