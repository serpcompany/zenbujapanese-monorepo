# Website working guide

`apps/web` is zenbujapanese.com: Next.js served from Cloudflare Workers through OpenNext, with
Cloudflare D1 through Drizzle. It owns its toolchain (pnpm, its own lockfile) per ADR 0005. Run
every command below from `apps/web`. Decisions and scope live in issue #402. What the dictionary
pages show, and the check that enforces each behavior, is in
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

Each build gets a fresh D1, named `zenbujapanese-<database>-<env>-<build id>`. The build ID
(`scripts/release-d1/build-id.sh <database>`) hashes everything that shapes the database: the
artifact's SHA-256 from its Git LFS pointer, the database's migrations, schema, and other inputs
(for search, the search core, which precomputes its cache), the shared scripts in
`scripts/release-d1/`, and the database's own scripts, but not another database's. Tests
(`*.test.ts`, `*.test.tsx`) are left out, so changing a gate's test alone doesn't import a new
build. Anything a gate's tests run or draw (the cores, the components a rendered-page test renders,
its reader, and the app-recorded suites) is a build input, so changing it does; and every build
input outside `apps/web/`, such as a re-recorded suite, is in the `Web deploy` workflow's `paths`.
`src/lib/dictionary/gate-inputs.test.ts` checks both from each database's `check_local`.
`scripts/release-d1/ensure-release.sh <database> <env>` imports it:

1. Build a local copy with `load-local.sh <database>`: the migrations from empty, the
   database's rows, and `dictionary_import` last. For search, the rows are `build-rows.py`'s and
   the precomputed broad queries; for the dictionary, every word and kanji
   (`dictionary/build-rows.py`).
2. Check that copy against its app-recorded conformance suites: search retrieval and search
   results for search, word detail and kanji detail for the dictionary. Nothing reaches D1
   unless it passes.
3. Create the D1, apply the migrations, and load the same files. A failed load deletes the new
   database.
4. Verify it before anything binds it: `dictionary_import` names this build, `d1_migrations`
   matches the migrations, the schema matches the schema dump (such as
   `src/db/search-schema.sql`), and every table holds the rows the local copy counted.

A database that already verifies is reused, so an unchanged build costs a deploy a few seconds.
One that definitely isn't a complete import of this build (a check ran and found a different
build, migrations, schema, or row counts, or a missing table, as a cancelled import leaves) is
deleted and imported again. When a check can't run at all, because a Wrangler or D1 call failed,
the step fails and the database is kept, since it is usually the live one: rerun the deploy
once D1 answers. Once a deploy passes its smoke test,
`scripts/release-d1/prune.sh <database> <env> <live database>` deletes that database's older
builds, keeping the live one and the newest complete older one, so rolling back is redeploying
the previous commit. It keeps any build whose import it can't check. The `Release database`
workflow runs the import by hand for either database and environment.

`Web deploy` imports both for each environment before deploying it, staging then production,
binds `SEARCH_DB` and `DICTIONARY_DB` to the databases it names by replacing that environment's
`*_DB_NAME` and `*_DB_ID` placeholders in `wrangler.jsonc`, and checks that both were built from
the same `LanguageReferenceData.sqlite3` (`dictionary_import.sha256`) before deploying, since
search results link to word pages. After each environment's smoke test it prunes that
environment's old builds. It runs when any release database's input changes, not only
`apps/web/**`. The production job runs once staging passes; the `production` GitHub environment
has no required reviewer (the owner approved launching without one). A new build's first
production import is about 850 MB for both databases and takes
about 30 minutes; an unchanged build is reused in seconds.

### The search database

Search reads its own release database, bound as `SEARCH_DB`, so broad searches never queue in
front of word and kanji pages.

**Broad queries are precomputed.** On D1, a query such as い reads 460,276 rows and takes 1.4–3.4
s, and D1 runs one query at a time per database, so a few of them stall every other query. The
import runs about 19,000 candidates (`search/candidates.py`) through the core on the local copy and
stores the results of those that read over 20,000 rows in `search_cache` (about 280 queries, 9
MB). `websiteSearch` reads the list of cached queries once per isolate, answers those from
`search_cache` in about 30 ms, and runs the core for everything else. The measurements are on
issue 464, from the `Search D1 benchmark` workflow.

**Frequency lives here too.** `entry_frequency` holds each entry's evidence in the app's default
frequency dictionaries (JLPT levels, then TUBELEX ranks; 59,430 entries), keyed by Language
Reference ID, which `build-rows.py` reads from `JLPTLevelPack.sqlite3` and
`TUBELEXFrequencyPack.sqlite3` with the dictionary import's `language_data.py`. The results page
reads it for all of a search's results in one query, so the search database alone decides what
the page lists and in what order, and its import gate checks all of it.

### Search results

`src/lib/dictionary/results/` is the results screen's core, ported from SearchView.swift and
FrequencyPack.swift: pure functions over the search core's results and their frequency.
`orderedItems` is `SearchResultFrequencyOrdering.ordered`: within each match group (the result's
source, then its coarse match rank), the more common tier from the first dictionary that has one,
then each dictionary's value in priority order (lower first, ranked before unranked), then the
retrieval order, then the Language Reference ID. Discovered Words keep their order.
`searchResultsScreen` adds what `SearchResultsView` shows: each row's meaning (the matched meaning
for an English query), its chips, the "Search for「…」" reading refinement, the KANJI row that
leads a one-kanji query with the meaning of the entry written as that kanji (chosen before the
re-sort, "Kanji detail" without one), and No Dictionary Matches. The page's component,
`components/dictionary/search-results.tsx`, only renders it. `results/links.ts` adds links
(`linkSearchScreen`, shared by `data.ts` and the rendered-page test) and decides indexing: a page
is indexed only when it lists a word or its kanji row opens a kanji page.

The app's "View N Example Sentences" row is left out until the website has example search: the
app searches all 232,703 Tatoeba pairs by English phrase (FTS4 Porter) or Japanese substring, and
the dictionary database holds only the 203,727 its words use, with no such index (#511).

**The gate.** The search import runs three files on its local copy (`check_local`): the retrieval
suite (`search/conformance.test.ts`), the search results suite
(`apps/ios/LanguageData/Conformance/search-results.json`, `results/conformance.test.ts`), which
compares every case's state, sections, refinement, kanji row, and every row's ID, entry number,
headword, reading, meaning, chips, match group, and retrieval position, and a rendered-page test
(`components/dictionary/search-results.test.tsx`) that renders six of its cases with React's
server renderer and reads the visible order, meanings, chips, links, and special rows back from
the HTML. The results core, `detail/frequency.ts`, the page's component and `rendered.ts`, the
frequency packs, and the suite itself are search build inputs, so a change to any of them imports
a new build and runs the gate. `smoke.sh` reads the suite's `iru` case at run time and checks the
deployed page's refinement and first rows against it.

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

Word and kanji pages read their own release database, bound as `DICTIONARY_DB` (issue 464,
phase 2). `src/db/dictionary-schema.ts` holds
its tables, named for the rows the detail core reads (`src/lib/dictionary/detail/rows.ts`):
`words` by `ent_seq`, `kanji` by the exact character, stroke order, kanji structure and
elements, example sentences with each word's examples (at most 100, in the app's order), retired
IDs, and `dictionary_import`, which also records each input file's SHA-256. Display-only data is
JSON. It has no FTS tables.

Examples are stored in two parts. `example_sentences` holds each Tatoeba pair once, with tokens
that are the same on every page and attribution for each side: the Japanese sentence and its
English translation are separate Tatoeba sentences with their own ID, contributor, and license.
`word_examples` holds what depends on the page's word: which tokens are the word (`highlights`)
and where each word token links (`links`, `{ token, entSeqs }`). A token that resolves to one
entry has one `ent_seq`; a token the app can't resolve, such as だ, keeps all its candidates, as
the word-detail conformance suite records them. A link also carries the furigana the app shows
over the word when it isn't Kuromoji's reading (the app shows the entry's reading when the word is
written as one of the entry's forms). `word_examples.tokens` replaces the sentence's tokens on the
few pages (30 examples) where the app splits it differently: a joined word the page's entry is
written as (おせじに on お世辞's page) stays whole there and falls back to its pieces elsewhere.
`word_example_counts` holds each word's listed count and the count the app's retrieval reports.
`dictionary-schema.test.ts` stores and reads back every token in that suite.

**The import** (`scripts/release-d1/dictionary/`) reads the app's bundled files with
`language_data.py`, the same code `scripts/export-dictionary-fixtures.py` exports fixtures with,
and writes every word (218,382) and kanji (13,108), the kanji structures, the element glyphs,
and stroke order for the 6,430 kanji `KanjiStrokeData.sqlite3` draws (KanjiVG), each checked as
the app decodes it (`KanjiStrokeOrderClient.swift`). Each word row carries its slug, forms, senses with their restrictions, related words
resolved to `ent_seq`, UniDic and CompoundPitch pitch, and JLPT and TUBELEX frequency. Each kanji
row carries its word list, precomputed with the app's `kanjiCandidateRowsSQL` and grouping
(`entries(containingKanji:)`), and whether search engines may index it. It refuses an artifact
whose `transform` or `artifact_schema` it doesn't list, or a pack built for another
`LanguageReferenceData.sqlite3`, and records every input's SHA-256 in
`dictionary_import.sources`. It also writes `word_sitemaps`, the `ent_seq` range of each word
sitemap (see Sitemaps). `retired_ids` stays empty until #463 records retired entries: the
artifact's prior-snapshot fields are placeholders, so no release knows yet which entries it
retired.

**Examples** are precomputed by `dictionary/build-examples.mts` (tsx), which runs TypeScript ports
of the app's code over every entry: retrieval (`src/lib/dictionary/examples/retrieval.ts`, from
`ExampleSentenceClient.swift`: the selected form, other written forms, then the reading, each by
first position in graphemes, then length and pair ID; ExampleWordIndex for kana headwords;
`unambiguousEntryCount`; at most 100 with the app's count), tokens from the app's own
`kuromoji.js` and IPADIC files (pinned by SHA-256, loaded through the app's XMLHttpRequest shim in a
bare V8 context, `examples/kuromoji.ts`), and linking (`examples/linking.ts`, from
`JapaneseTextAnalysisClient.swift` and `JapaneseInflectionGrouping.swift`, looking words up with the
search core's `rankJapanese`). The app scans every sentence per entry; the import instead finds
every term's occurrences in one pass and merges them in rank order, and checks that against the
app's scan on every build: 80 entries from each retrieval path (kana headwords, ambiguous forms,
refused entries, and written headwords with and without over 100 matches), drawn afresh per build
from its build ID. 48,169 words have examples: 902,279 word examples over
203,727 sentences. As in the app, 2,043 words whose headword changes under NFKC (Ｔシャツ) have none.
The rows are written as SQL files of at most 100 MB (`examples-NN.sql`) and 500 rows per INSERT,
since a local D1 fails on larger ones. The local build then checks that every example table holds
the rows the precompute wrote (`examples-counts.json`), so a file Wrangler drops without failing
stops the import before the row counts are recorded or anything is uploaded.

A local build takes about 3.5 minutes (2 minutes 40 of it the example precompute, which peaks
at about 2.5 GB of memory) and about 610 MB: stroke order is about 10 MB, and the examples add about 450 MB, 335 MB of it
`word_examples`.

**The gate** (`src/lib/dictionary/detail/conformance.test.ts`) replays the app-recorded
word-detail and kanji-detail suites (`apps/ios/LanguageData/Conformance/`) through the detail
core on the local copy, reading it through `dictionary-db.ts` as the pages do, and checks every
stored slug against `wordSlug`. It checks every example field the suite records (order, pair
IDs, text, tokens, links, highlights, and counts) and that each side's attribution is intact, and stops
at once when the copy wasn't built from the files the suites pin. It also checks the headword's
per-kanji furigana split, the pitch graph's points, and each Frequency row's details. The import
then draws every word-detail case through the word page's components
(`src/components/dictionary/word-page.test.tsx`) and reads back what they draw, so a component
that draws the core's values wrong fails the import too.

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
succeeds. The suites stop at once when `.search-d1/` wasn't built from the artifact they pin, or
the frequency packs differ from the ones the search results suite pins. Without
`ZENBU_SEARCH_D1=1`, `pnpm test` skips them. With either variable set, test files run one at a
time (`vitest.config.ts`), since a local D1 can't serve two processes at once.

The dictionary database builds the same way into `.dictionary-d1/` (about 3.5 minutes; it needs
the Git LFS inputs listed in `scripts/release-d1/dictionary/database.sh`), and its gate runs with
`ZENBU_DICTIONARY_D1=1`:

```sh
scripts/release-d1/load-local.sh dictionary
ZENBU_DICTIONARY_D1=1 pnpm test
```

The search core takes capabilities a client supplies (ADR 0008). The website, configured in
`website.ts`, supplies none, so it has no sentence search. Like the app, `search()` throws when
the database fails or an English query can't be read as full text, such as one with a NUL.

The search results page reads it through `searchDictionary` in `src/lib/dictionary/data.ts`. A
query full-text search can't read (an FTS5 error, `isUnreadableQuery`) is treated as finding
nothing; any other failure fails the request, so an outage never renders as an empty, noindexed
page. Only local development falls back to fixtures, when `SEARCH_DB` is unbound or holds no
finished import (no `dictionary_import` row), as in `pnpm dev`. Staging and production (`SITE_ENV`
set) serve the dictionary, so there a missing binding, or one bound to a database without an
import, fails the request rather than passing fixtures off as the dictionary. `DICTIONARY_DB`
works the same way. The results are ordered and drawn by the results core (see Search results),
with frequency from the search database's `entry_frequency`. Once `DICTIONARY_DB` holds an
import, every result links to its word page, and the kanji row links to its kanji page when the
dictionary database has one; otherwise only fixture words and kanji link.

## Word and kanji pages

`src/lib/dictionary/detail/` is the detail core: pure functions, `wordDetail(rows)` and
`kanjiDetail(rows)`, that turn rows shaped like the dictionary D1 (`detail/rows.ts`) into what
the word and kanji pages render. Each function is a port of the app's Swift and names its source,
so the pages show what the app shows (see the
[product docs](../../apps/web/docs/product/dictionary.md)). `data.ts` runs the core and adds only
URLs.

`getWordPage` and `getKanjiPage` read `DICTIONARY_DB` through `dictionary-db.ts`, one batch (one
round trip) per page, when it holds a finished import. A word page's later examples load from
`/dictionary/examples/<ent_seq>.json?build=<build ID>&from=<n>` (`getWordExamples`). The URL names
the page's dictionary build, and another build's examples aren't found. Word pages live under the
stored slug (`words.slug`). A failing database fails the request rather than rendering a 404.

Without an import, as in `pnpm dev` by default, the rows are local fixtures in
`src/lib/dictionary/fixtures/`, exported from the app's bundled data by
`scripts/export-dictionary-fixtures.py` with the import's own code, so their shapes can't drift;
each fixture word keeps its first 50 examples, from `build-examples.mts` given the words' numbers.
Rerun it after changing a row shape; the fixture JSON is generated, so Biome skips it.

To run `pnpm dev` on the whole dictionary, build it and copy it into Wrangler's local state (the
file is named for the local `DICTIONARY_DB` ID in `wrangler.jsonc`; search works the same way from
`.search-d1/`):

```sh
scripts/release-d1/load-local.sh dictionary
d1=v3/d1/miniflare-D1DatabaseObject
mkdir -p ".wrangler/state/$d1"
for file in .dictionary-d1/$d1/*.sqlite; do
  [ "$(basename "$file")" = metadata.sqlite ] ||
    sqlite3 "$file" "VACUUM INTO '.wrangler/state/$d1/$(basename "$file")'"
done
```

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
and smoke-tests its workers.dev URL. Staging's smoke tests are the gate: the `production` GitHub
environment has no required reviewer, by the owner's decision, even though production imports the
dictionary's release databases (see Release databases). Add one (Settings → Environments →
production) to review production imports by hand. Both environments deploy only from `main`.
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
This section covers the site's database, `DB`; the release databases, `SEARCH_DB` and
`DICTIONARY_DB`, have their own schemas and migrations and are imported per build (see
Dictionary search). All three
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

The dictionary's sitemaps (`src/lib/dictionary/sitemaps.ts`, ADR 0007) exist wherever
`DICTIONARY_DB` holds an import, staging and production, not local fixtures, so the index renders
per request. `/dictionary/`, the search box, is a static page in `src/lib/pages.ts`:

- `/sitemaps/dictionary/<n>.xml`: every word page's canonical URL, percent-encoded, 50,000 to a
  file in `ent_seq` order (five files for 218,382 words). The import precomputes each file's
  `ent_seq` range into `word_sitemaps`, so a file reads only its own words, by primary key, and
  streams them 10,000 at a time; the index reads only `word_sitemaps`.
- `/sitemaps/kanji.xml`: the kanji pages search engines may index (`kanji.indexable`). The import
  stops if the indexable kanji ever outgrow one file.

Both are kept in the Worker's edge cache (the Cache API) under the dictionary build, so a new
build replaces them at once; `pnpm dev` has no such cache.

## Retired word URLs

A word URL whose `ent_seq` is in `retired_ids` answers 410 or 308 (ADR 0007; the behavior is in
the [product docs](../../apps/web/docs/product/dictionary.md#urls-seo-and-indexing)). Next.js
pages can't answer 410, so `worker.ts`, the Worker's entry in `wrangler.jsonc`, answers these
before OpenNext's worker and passes every other request on (`src/lib/dictionary/retired.ts`). It reads `retired_ids` once per isolate,
wherever `DICTIONARY_DB` is bound. `pnpm dev` runs Next.js alone, so check retired URLs in
`pnpm preview`. The table is empty until #463 records retired entries.
