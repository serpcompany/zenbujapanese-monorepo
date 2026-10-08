# Website working guide

`apps/web` is zenbujapanese.com: Next.js served from Cloudflare Workers through OpenNext, with
no database of its own. It reads the dictionary from the dictionary service
(`apps/dictionary-api`, ADR 0009; see
[`dictionary-api.md`](dictionary-api.md)). It builds with pnpm in the repository's workspace (the
root `pnpm-workspace.yaml` and lockfile), which it shares with the dictionary core
(`packages/dictionary-core`) and the service, and still owns its build, tests, and deploys
(ADR 0005). Run every command below from `apps/web`. Decisions and scope live in issue #402.
What the dictionary pages show, and the check that enforces each behavior, is in
[`apps/web/docs/product/`](../../apps/web/docs/product/index.md).

The website follows these SERP engineering standards:

- [Environment configuration](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/environment-configuration.md)
- [URL trailing slash](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/url-trailing-slash.md):
  pages end with a slash (`/about/`); files never do (`/robots.txt`, `/sitemap-index.xml`). The
  other form redirects (308) to it. `src/lib/pages.ts` is the single list of static page paths.
  Next.js redirects `/robots.txt/` to `/robots.txt` itself, but OpenNext skips it, so
  `next.config.ts` repeats that redirect, with a rule of its own for a top-level file, since
  OpenNext can't fill an empty path parameter.

Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/`; this
Next.js version differs from older releases (see `apps/web/AGENTS.md`).

## Run and verify

- `pnpm dev` runs Next.js in Node, with Cloudflare bindings and `.dev.vars` available through
  `getCloudflareContext()` (`initOpenNextCloudflareForDev` in `next.config.ts`). Dictionary pages
  show local fixtures unless `.dev.vars` names a dictionary service (see Dictionary).
- `pnpm preview` builds with OpenNext and serves the Worker in workerd, the production runtime.
  Check routes, redirects, and headers there before deploying.
- `pnpm check` runs Biome, typecheck, Vitest, and `next build`. The `Web` GitHub Actions workflow
  runs it on pull requests that change `apps/web/**` or the core.
- `pnpm test:e2e` runs the browser tests in `apps/web/e2e/` with Playwright, at a desktop and a
  phone width, on the dictionary fixtures. Locally it starts `next dev` on port 3100 with
  `ZENBU_DICTIONARY_FIXTURES=1`, which makes the site read the fixtures even when `.dev.vars` names
  a service (it's ignored on staging and production); in CI it runs on the production build in
  workerd (`E2E_SERVER=preview`). Every test fails when a page logs a console error or throws, so a
  hydration error anywhere a test goes fails the run. How to run one test, read a failure, and add a
  regression test is in the `browser-tests` skill (`.claude/skills/browser-tests/SKILL.md`).
- `scripts/smoke.sh <base-url> <staging|production>` checks a running site's key pages, the
  `/privacy` redirect, that environment's search-engine rules, and dictionary pages against the
  app-recorded suites. Each check retries for about 15 seconds, since for a few seconds after a
  deploy some requests still reach the previous Worker version.

After changing routes, open the changed pages in `pnpm preview` and confirm `/sitemap-index.xml`
lists every child sitemap and each child sitemap lists the new URLs.

### How the build and checks are set up

- Next.js compiles the core's TypeScript source with the site (`transpilePackages` in
  `apps/web/next.config.ts`). `turbopack.root` is the workspace root, where the lockfile is:
  Turbopack reads the core from there, and OpenNext finds the site's standalone build under it
  (`.next/standalone/apps/web`).
- The generated `apps/web/cloudflare-env.d.ts` imports `worker.ts`'s type, so `tsc` reads
  `apps/web/worker.ts` although `tsconfig.json` leaves it out. Its import of
  `.open-next/worker.js` resolves only after an OpenNext build; until then
  `apps/web/open-next-worker.d.ts` types it, so a fresh checkout typechecks too.
- `apps/web/playwright.config.ts` names the browser tests' two projects, `desktop` and `phone`,
  and their server. Dev assertions wait 15 seconds, since `next dev` compiles each route on first
  use; the production build keeps Playwright's 5, and runs on one worker, as one workerd process
  renders every page. It sets `ZENBU_ACCOUNT_PAGES` for the tests as `next.config.ts` does for the
  build (Account pages, below), from the run's `SITE_ENV`, or `production` with
  `E2E_SITE_ENV=production`, so the `placeholderLinks` the tests import list Log in only where the
  build's account pages are closed. Run the tests with the `SITE_ENV` the build had, or
  `placeholders.spec.ts` reads the wrong list. `apps/web/e2e/test.ts` holds the console check and
  the fixture helpers every spec imports.
- `apps/web/vitest.config.ts` has two projects: `*.interaction.test.tsx` run in happy-dom, the
  other tests in Node. Both set `__NEXT_TRAILING_SLASH`, so `next/link` draws links with their
  trailing slash, as the build does with `trailingSlash`.
- A link whose page or address doesn't exist yet points at `#`, and is listed once, by what it
  stands for, in `linkTargets` in `apps/web/src/lib/site.ts`; its links carry `data-link-target`.
  `apps/web/e2e/placeholders.spec.ts` fails on any other `#` link and prints the listed ones
  ([product docs](../../apps/web/docs/product/dictionary.md#header-footer-and-site-wide),
  Placeholder links). When a page ships, give its entry the page's path, as the products pages'
  entries have, so every link to it changes at once, or link it directly and drop the entry. Log
  in's entry has `/login/` only in a build whose account pages are open (Account pages, below).
- `apps/web/public/` holds the header's images (App Store screenshot crops and the app icon), a
  larger app icon (`app-icon-192.webp`) and, in `apps/web/public/screenshots/app-store/`, whole App
  Store screenshots for the homepage and the products pages, each named for its file in
  `apps/ios/screenshots/app-store/en-US/iphone-63/` and made with `cwebp -q 80 -resize 600 0`.
  `apps/web/src/lib/app-screenshots.ts` lists them with their alt text, and
  `apps/web/src/components/app-screenshot.tsx` draws one without a device frame.
  `next/image` renders them `unoptimized`, since the site sets up no image optimization on Workers.
- The products pages ([product docs](../../apps/web/docs/product/products.md)): `/products/` is
  static, and its filters read `?type=` with `useSearchParams` inside a `Suspense` whose fallback
  is the unfiltered catalog, so the built HTML holds every product and the browser hides the rest.
  A filter moves the address with `history.pushState`, which Next.js's router follows, so it never
  asks the server. The iPhone app's page is `force-dynamic`: it reads the App Store lookup
  (`src/lib/app-store.ts`), which the Worker keeps in its edge cache (the Cache API) for a day,
  keeps a failure for 5 minutes, and leaves the version and minimum iOS out when Apple fails or
  lists no app. The facts row streams in its own `Suspense`, so the lookup never holds back the
  rest of the page. Its Watch it work
  section renders only when `appVideos` in `src/lib/videos.ts` lists videos, and a video's
  privacy-enhanced YouTube player (`youtube-nocookie.com`) mounts only when it's clicked.
- `apps/web/biome.json` allows `dangerouslySetInnerHTML` only in
  `apps/web/src/components/dictionary/dictionary-breadcrumbs.tsx`, for its `BreadcrumbList`
  JSON-LD, which escapes `<` so the JSON can't close its script tag (the Next.js JSON-LD guide).
- The scripts in `apps/web/scripts/` read a command's output whole before searching it:
  `curl | grep -q` fails under `pipefail` when grep exits early. Their `.shellcheckrc` turns off
  ShellCheck's SC2329: `smoke.sh`'s checks are functions that `eventually` calls by name, which
  ShellCheck reads as never called.

### Code layout

`apps/web/src` has three layers, and imports point down only. Biome's `noRestrictedImports`
enforces each rule (`apps/web/biome.json`), with a message that says where the code belongs; tests
may import anything.

- `src/lib` holds the site's data and logic. It imports no component, hook, or route.
- `src/components` and `src/hooks` render what they're given. They import from `src/lib`, never a
  route.
- `src/app` holds the routes, which put the other two together.
- `src/test` holds what only tests use: the rendered-page gate and the readers of rendered HTML.
  Nothing outside a test imports it.

Only `src/lib/dictionary/data.ts` reads the dictionary service's client
(`src/lib/dictionary/api.ts`), so every page gets the site's URLs and, in local development, the
fixtures; the one other caller is `src/lib/dictionary/retired.ts`, which `worker.ts` runs before
Next.js. The browse pages' data (`src/lib/dictionary/browse/data.ts`) and the sitemaps
(`src/lib/dictionary/sitemaps.ts`) ask the client `data.ts`'s `dictionaryService()` returns. The rendered-page gate's `src/test/gate.ts` is test tooling and calls it directly.

`pnpm verify dependencies` checks the same layers by the files imports resolve to, and more: no
import cycles, nothing outside a test importing a test or `src/test`, every module reachable from
a route or `worker.ts`, nothing `worker.ts` reaches loading Next.js or React, and no import of the
dictionary service's code ([`code.md`](code.md), Imports).

The site logs JSON lines through `log()` in `apps/web/src/lib/log.ts`: a level, a message that
names the event (`dictionary_service_unreachable`), and fields. Workers Logs keep them. Nothing
else calls `console`, which Biome's `noRestrictedGlobals` enforces outside tests, so every line an
agent reads there has the same shape.

## Dictionary

Every search, word, kanji, example, sitemap, and retired entry comes from the dictionary service,
which runs the shared core on the app's own artifact (ADR 0009). Nothing is precomputed or
imported: a new build of the dictionary is a new service image, and the site needs no deploy for
it. Pages read the service only through `src/lib/dictionary/data.ts`, which runs the core's detail
functions over the rows the service answers with and adds only the site's URLs. Its page functions
are memoized per request (React's `cache`), so a page and its metadata ask the service once.

`src/lib/dictionary/api.ts` is the service's client. It sends the `DICTIONARY_API_TOKEN` secret as
a bearer token to `DICTIONARY_API_URL` and keeps each answer in the Worker's edge cache (the Cache
API) for 10 minutes, keyed without the token, since that cache is the Worker's own, not a shared
HTTP cache; `pnpm dev` has no such cache. The service names the build that answered
(`X-Dictionary-Build`: the artifact's SHA-256 prefix and the service's release), and URLs that
load more of a page's list carry it, so a page open across a new build never mixes two builds'
lists. Such a list (`apps/web/src/components/dictionary/load-more.tsx`) asks for the items from
the number it shows, so none repeats or is skipped; a route that no longer knows the page's build
answers 404, and the list offers a reload. Since those URLs name their build, browsers and the
edge keep their answers for a day.

The service names its contract too (`X-Dictionary-Contract`), the number of its answers' shapes
([`dictionary-core.md`](dictionary-core.md), Rules). The site and the service deploy separately,
in either order, so after a change to a shape they can disagree until the other deploys. The site
still serves then: it logs `dictionary_contract_mismatch` (a warning, with both numbers), and
leaves that answer out of the edge cache, whose key names the contract, so it reads the matching
answer as soon as the service has it. A service that names no contract answers the first one.
`/dictionary/service.json` shows both (`contract` and `siteContract`), and the smoke test warns
when they differ. A 404 from the service means "not there" (no such word, kanji,
or sitemap, or a search without examples); any other failure fails the request, so an outage never
renders as an empty or noindexed page. A query or form over the service's 200 characters
(`maximumQueryLength`) finds nothing without asking it.

Only local development falls back to fixtures, when no `DICTIONARY_API_URL` is set, as in
`pnpm dev` by default. Staging and production (`SITE_ENV` set) always name a service, and there a
missing one fails the request rather than passing fixtures off as the dictionary.
`apps/web/.gitignore` still lists `.search-d1/` and `.dictionary-d1/`, local copies of the
dictionary from before the service; they're safe to delete.

To run `pnpm dev` on the whole dictionary, start the service (see
[`dictionary-api.md`](dictionary-api.md)) and name it in `.dev.vars` in `apps/web`, which is
never committed:

```sh
DICTIONARY_API_URL=http://localhost:8788
DICTIONARY_API_TOKEN=<the token the service was started with>
```

### Search results

The service runs the search core (`packages/dictionary-core/src/search/`, the app's Search
retrieval with its own SQL on the artifact's FTS4 indexes) and the results core
(`packages/dictionary-core/src/results/`, ported from SearchResultsView.swift,
SearchResultFrequencyOrdering.swift, and FrequencyPresentation.swift), and answers with the results
screen. `orderedItems` is
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
a word or its kanji row has details to show. The KANJI row opens in place to the kanji's details
(`components/dictionary/kanji-details.tsx`, from `getKanjiDetails`), as the word page's kanji do.
A query full-text search can't read is answered as finding nothing by the service.

With Sudachi, the service analyzes a sentence as the app does and lists its Discovered Words.
The Example Sentences row goes where the sentences are (`examplesTarget` in `results/links.ts`,
ADR 0010):

- To a word page's Examples (`#examples`), when the sentences are that word's: the primary
  entry's for a romaji or deinflected search, or the top result's for a Japanese one.
- To a section on the results page itself, for an English search, whose sentences match its
  English words and aren't any one word's. The section lists 25 at first and loads the rest from
  `examples.json` beside the page; the page fetches them only then (`getSearchExamples`).

A broad query (い, "to") takes the service one to two seconds the first time, most of it the
app's own SQL, and a one-letter wildcard's Example Sentences (`t*`, over 100,000 sentences) up to
about five; the service and the edge cache keep the answer after that.

### Word pages

`packages/dictionary-core/src/detail/` is the detail core: pure functions, `wordDetail(rows)` and
`kanjiDetail(rows)`, that turn the service's rows (`detail/rows.ts`) into what the word page and
kanji details render. Each function is a port of the app's Swift (the Swift sources section of
[`dictionary-core.md`](dictionary-core.md) names each one's source), so the pages show what the
app shows (see the [product docs](../../apps/web/docs/product/dictionary.md)).

The word page holds everything the app drills into from a word (ADR 0010), in sections that open
and close and stay in the HTML while closed (`components/dictionary/disclosure.tsx`):

- **Conjugations:** the header's part of speech opens it (`#conjugations`). Each form opens to
  its examples, which load from `/dictionary/conjugations/<form>.json` the first time it opens
  (`components/dictionary/conjugations.tsx`).
- **Kanji:** each kanji opens to its details.
- **Examples:** the section the search page's Example Sentences row links to (`#examples`).

`getWordPage` asks the service for the word, then for each of its kanji's details
(`getKanjiDetails`, cached per request). The word's answer names the slug of every word it links
to and which kanji have details, so every link goes somewhere that exists; a kanji links to its
search page, which opens to its details. Word pages live under the slug the service names, and a
redirect to it percent-encodes the path (`encodeURI`), since a `Location` header is ASCII. A word
page's later examples load from `/dictionary/examples/<ent_seq>.json?build=<build>&from=<n>`
(`getWordExamples`).

The kanji, conjugation, and Example Sentences pages that came before ADR 0010 are gone. Their
URLs answer 308 to the nearest page (`removedDictionaryPages` in `apps/web/src/lib/moved-pages.ts`,
which `next.config.ts` reads). `apps/web/src/app/routes.test.ts` fails when a page or data route
appears that ADR 0010 doesn't list.

Next.js passes a page its segment encoded but `generateMetadata` decoded: search pages tell
`searchQuery` which it has (`decoded`), and word pages read it with `decodeSegment`
(`apps/web/src/lib/dictionary/urls.ts`), which accepts either. The JSON routes read their text
from the request's path as sent and decode it once
(`apps/web/src/lib/dictionary/example-routes.ts`); a search's route answers only a query already
in its normal form, as its page asks for it.

The detail core conjugates the word's rows into the Conjugations section's table. Both
registers' forms are in the page's HTML, the one not shown hidden, so the Plain and Polite tabs
switch without a request and the register isn't in the address. A form loads all its examples
from `/dictionary/conjugations/<form>.json` (`getConjugationExamples`) the first time it opens;
that URL names no build, so its answers are kept an hour rather than a day. The route reads the
spelling as written, since the app's form screen searches it normalized but matches it as written
(a full-width Ｈ).

Without a service, the rows are local fixtures in `packages/dictionary-core/src/fixtures/`,
exported from the app's bundled data by the service's own readers (`pnpm --filter
zenbujapanese-dictionary-api fixtures`), so their shapes can't drift; each fixture word and each
of its conjugated forms keeps its first 50 examples. Rerun it after changing a row shape; the
fixture JSON is generated, so Biome skips it. A fixture search lists its words in
`fixtureSearchOrder`, the app's order: each is its own match group, so the frequency re-sort
keeps that order.

### Browse pages

The browse pages (ADR 0010, amended for #614; the
[product docs](../../apps/web/docs/product/browse.md)) list words and kanji by kana, category,
frequency list, and kanji list, under `/dictionary/browse/`. `src/lib/dictionary/browse/data.ts`
asks the service's browse routes ([`dictionary-api.md`](dictionary-api.md), Routes) at the paths
`packages/dictionary-core/src/browse/service-paths.ts` names, and links each word as search
results do (`linkedWordPath`). Without a service, it answers from the answers `pnpm --filter
zenbujapanese-dictionary-api fixtures` exports to `packages/dictionary-core/src/fixtures/browse.json`,
keyed by those paths: the summary, both scripts, い and the いる group, the categories,
`ichidan-verbs` (two pages most used first and one in kana order) and `audiovisual` (one word, so
not indexed), the ranked lists, YouTube's and anime's first bands, and JLPT N5, and the kanji
lists, grade 4, JLPT N5's kanji, and all of jinmeiyō, with its compatibility kanji. Each word list
is cut to its first 20 words. Any other browse page is a 404 there.

`src/lib/dictionary/browse/paths.ts` builds the pages' URLs: a list's first page has no number,
and `…/1/` redirects to it; a ranked list's page is a band of 1,000 ranks (`…/anime/1001-2000/`),
and its name links to the first band; a JLPT level is `…/jlpt/n5/`; and a category's kana order is
`…/<category>/kana-order/`. A list of fewer than 10 words, and a category's kana order, are
`noindex, follow` (`dictionaryMetadata`'s `index`) and left out of `/sitemaps/browse.xml`. No
browse page links to a URL that redirects (`e2e/browse-links.spec.ts` follows every link). The
hiragana and katakana routes, and each category's four, are one line each over the route helpers
beside them (`kana-routes.tsx`, `category-routes.tsx`, `frequency-dictionaries/list-routes.tsx`). Pages without parameters that read the service are
`force-dynamic`, as `/dictionary/` now is, so a build never reads it
(`src/app/dictionary/browse/dynamic.test.ts`). The home leaves its browse sections out when the
service can't answer (`getHomeBrowse`), as when the site deploys a few minutes ahead
of a service without the browse routes, rather than failing the search box with them. The words show as search
results' rows do (`components/dictionary/word-row.tsx`).

### The rendered-page gate

The service's own tests replay the app-recorded suites (`apps/ios/LanguageData/Conformance/`)
through the core on the real artifact: search retrieval, search results, example search, word
detail, and kanji detail, every example field included (see
[`dictionary-api.md`](dictionary-api.md)). The site's gate then renders what a running service
answers through the pages' components with React's server renderer, linked by the same code as
`data.ts` (`apps/web/src/lib/dictionary/page-example.ts` and
`apps/web/src/lib/dictionary/results/links.ts`), and reads back what a reader sees, from the
drawing itself (such as each pitch dot's position) rather than the data the page was given.
`apps/web/src/test/rendered.ts` and `rendered-word.ts` do the reading. Their one
text extractor, `htmlText`, removes tags until none remain and leaves `&lt;` and `&gt;` encoded,
so the text it reads never holds a `<` (`rendered.test.ts`). The gate's tests:

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
example-search suite's `eat`, and the word-detail suite's 見る and 学校 at run time.

## Account pages

`/login/`, `/register/`, `/forgot-password/`, and `/account/` sign a learner in to their Zenbu
account and manage it (#468; the [product docs](../../apps/web/docs/product/account.md)), against
the account service ([`account-api.md`](account-api.md); the website's side of it is
[`account-clients.md`](account-clients.md), The website).

- **The learner's browser calls the service, never the Worker.** Bot Fight Mode challenges the
  Worker's own requests to the API host (Dictionary service, below), so the Worker only renders
  the pages, with the service's URL, and their components call the service with `fetch` and
  `credentials: 'include'`. The service keeps the session in an HttpOnly cookie on its own host,
  which no page can read; the pages keep the 15-minute access token in memory
  (`src/lib/account/access-tokens.ts`), for the account they show only, and send it only to
  `/v1/me`, without cookies. Deleting the account, signing in again, coming back from a Google
  confirmation, and checking the browser is still signed in to the account on the page are in
  `src/lib/account/flows.ts`; the components make the other calls.
- **Each answer's shape is checked where it enters** (`src/lib/account/answers.ts`), and the
  client (`src/lib/account/client.ts`) turns every answer into a value, a refusal with its code and
  `Retry-After`, a network failure, or an answer of another shape; `src/lib/account/messages.ts`
  says each to the learner.
- **Settings per environment**, Worker `vars` read per request (the pages are `force-dynamic`), in
  `src/lib/account/settings.ts`. The header and footer are in static pages too, which are built
  once, so they can't read a Worker var: `next.config.ts` reads the environment's
  `ACCOUNT_API_URL` from `wrangler.jsonc` when it builds (`src/lib/account/availability.ts`, by
  `SITE_ENV`) and passes `ZENBU_ACCOUNT_PAGES` (`open` or `closed`) to the build, which draws the
  footer's Sign in, and points the `login` entry in `linkTargets` (`src/lib/site.ts`), the
  header's Log in, at `/login/` rather than `#`, only where it's `open`. A value set only in
  `.dev.vars` changes the pages, not the header or footer. The `Web` workflow checks staging's
  build links signing in, and production's has no link to it, its Log in still `#` (Browser
  tests, below; [`ci.md`](ci.md), Web).

  | Var | What it does |
  | --- | --- |
  | `ACCOUNT_API_URL` | The account service's origin: `http://localhost:8789` locally and `https://api-staging.zenbujapanese.com` on staging. Production's is empty until its account service answers on `https://api.zenbujapanese.com` (opening it, below). Empty, the pages say signing in isn't available, link to no other account page, the footer has no Sign in, and the header's Log in stays `#`. |
  | `ACCOUNT_APPLE_SERVICES_ID` | The Services ID Sign in with Apple JS signs in as: the first of the service's `APPLE_SERVICES_IDS`, the one the service takes the website's Apple codes as. Empty, the pages offer no Apple. |
  | `ACCOUNT_GOOGLE_SIGN_IN` | `on` offers Google, once the service has a Google web client. |

  Apple and Google are on for staging, whose account service has Apple's key and Google's web
  client ([`account-api.md`](account-api.md), Set up the server): under `env.staging.vars`,
  `"ACCOUNT_APPLE_SERVICES_ID": "com.zenbujapanese.web"`, the first of the service's
  `APPLE_SERVICES_IDS`, and `"ACCOUNT_GOOGLE_SIGN_IN": "on"`. The local site has neither, since
  Apple takes no `localhost` return URL and Google's web client returns only to the deployed
  services. Production's stay empty until its pages open; then set them under
  `env.production.vars` and run `pnpm cf-typegen`, in a pull request that also updates what then
  stops being true: "production neither yet" in the product docs'
  [Account pages](../../apps/web/docs/product/account.md), `src/lib/account/settings.test.ts`, and
  "Production's stay empty" here.

  **Opening production's account pages** waits for production's account service to answer on
  `https://api.zenbujapanese.com`, trust `https://zenbujapanese.com`
  (`ACCOUNT_API_TRUSTED_ORIGINS`), and email codes to everyone ([`account-api.md`](account-api.md),
  Set up the server); Apple and Google can follow later. Then it's one pull request: set
  production's `ACCOUNT_API_URL` to it, run `pnpm cf-typegen`, and change what pins it closed: the
  `Web` workflow's two closed-pages steps, `e2e/account-closed.spec.ts`, its server in
  `playwright.config.ts`, the closed-run flag in `e2e/server.ts` and `e2e/test.ts`, and
  `src/lib/account/settings.test.ts`; and the docs that say
  production's pages are closed: the product docs ([Account pages](../../apps/web/docs/product/account.md),
  the [index](../../apps/web/docs/product/index.md), [Privacy Policy](../../apps/web/docs/product/privacy.md),
  and [Dictionary](../../apps/web/docs/product/dictionary.md)'s Placeholder links and Get the app
  and Log in, where Log in stays `#` in production),
  this section and its closed-spec paragraph (below), [`ci.md`](ci.md) (Web),
  [`docs/quality.md`](../quality.md) (Account pages, and Header and footer's placeholders),
  [`docs/tech-debt.md`](../tech-debt.md)'s placeholder row, which counts Log in in production, and
  the `browser-tests` skill.
  The privacy policy's text stays true with the email code alone: it offers Apple and Google only
  "where its sign-in page offers them". `main` then deploys staging; production deploys when a
  person runs `Web deploy` by hand while `DEPLOY_PRODUCTION` is `false` (Environments and
  deploys, below).
- **Apple** runs in Sign in with Apple JS's popup (`src/lib/account/apple.ts`), which hands the
  page Apple's ID token and authorization code. Apple answers a popup only on a page of its return
  URL's origin, so the return URL is the site's own `/account/`, and deleting an Apple account
  sends it with the code (`appleRedirectUri`), for the service to take the code from Apple. The
  script loads, and the nonce is fetched, when the learner points at, focuses, or touches an Apple
  button, and the next nonce right after each popup, so a click opens the popup at once rather than
  after a request a popup blocker would count.
- **Google** goes through the service: `POST /v1/auth/sign-in/social` (or `link-social`) names the
  page to come back to, and the browser goes to Google, then to the service's
  `/v1/auth/callback/google`, then back, with `?error=` on a failure.
- **Code:** the routes in `src/app/login/`, `src/app/register/`, `src/app/forgot-password/`, and
  `src/app/account/`; the components in `src/components/account/`; the hooks
  `src/hooks/use-apple-sign-in.ts`, `src/hooks/use-busy.ts`, which frees the buttons when the
  browser comes back from Google with Back, and `src/hooks/use-seems-signed-in.ts`, which reads
  the local-storage note behind the footer's Sign in or Account (`src/lib/account/signed-in.ts`).
  A confirmation through Google leaves the page, so `src/lib/account/confirming.ts` keeps the
  account it left from in session storage, to sign its earlier session out on the way back; a
  failed load keeps it for Try again, and coming back with Back drops it.

To run them locally, run the account service ([`account-api.md`](account-api.md), Run it) with
`ACCOUNT_API_TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3100`; `pnpm dev` reads it at
`http://localhost:8789`, and `ACCOUNT_API_URL` in `.dev.vars` names another. Its dev mailbox,
`http://localhost:8789/dev/mail`, holds the codes.

**Browser tests.** `e2e/account.spec.ts` stands in for the service in the browser, so it runs
wherever the others do, CI's `Web` included. `e2e/account-service.spec.ts` drives a learner
through registering, editing the profile, signing out, signing in again, and deleting the account
with a fresh sign-in, against a real service and its dev mailbox. Like the dictionary's
rendered-page gate, it runs only when asked (`ZENBU_ACCOUNT_API=1`), and the `Account API`
workflow starts the service it checks and runs it ([`ci.md`](ci.md), Account API):

```sh
ZENBU_ACCOUNT_API=1 pnpm test:e2e e2e/account-service.spec.ts --project desktop
```

`ZENBU_ACCOUNT_API_URL` names a service elsewhere than `http://localhost:8789`, for reading its
mailbox; the site reads its own `ACCOUNT_API_URL`. A run sends three codes, and the service sends
at most five from one address in 10 minutes, so a second run within 10 minutes needs a new
database, or `delete from rate_limits` in it.

`e2e/account-closed.spec.ts` checks production's closed account pages, Log in, and footer on the
site built as production deploys (`SITE_ENV=production`, and a test Google Tag Manager ID, as `Web
deploy` passes the real one), served by `wrangler dev --env production` on port 8797 with production's
vars, no dictionary service, and `--env-file /dev/null`, so no `.dev.vars` or `.env` file can open
the pages. It answers every request off the site with an empty response, Tag Manager's included,
so nothing leaves the machine, and fails on any request to the account service. It runs only when
asked (`E2E_SITE_ENV=production`, which runs that spec alone), and the
`Web` workflow's `e2e` job runs it after the other browser tests:

```sh
SITE_ENV=production NEXT_PUBLIC_GTM_ID=GTM-TEST000 pnpm exec opennextjs-cloudflare build
E2E_SITE_ENV=production pnpm exec playwright test
```

That build replaces the one the other browser tests use in workerd, so build again without
`SITE_ENV` before running them there.

## Environments and deploys

| Environment | Worker | Domain |
| --- | --- | --- |
| Local | — | `localhost` |
| Staging | `zenbujapanese-web-staging` | `staging.zenbujapanese.com` |
| Production | `zenbujapanese-web-production` | `zenbujapanese.com` (`www` redirects to it) |

Deploys run only through the `Web deploy` GitHub Actions workflow, never from an agent's machine.
Each merge to `main` that changes `apps/web/**` or the core points staging at its dictionary
service, deploys staging, and smoke-tests its workers.dev URL (`scripts/smoke.sh`). The
production job then runs automatically once staging passes: it does the same for production with
the same commit. Staging's smoke tests are the gate: the `production` GitHub environment has no
required reviewer, by the owner's decision. Add one (Settings → Environments → production) to
review production deploys by hand. Both environments
deploy only from `main`. Setting the repository variable `DEPLOY_PRODUCTION` to `false` pauses the
production job on pushes, so `main` deploys staging only; a manual run of `Web deploy` still
deploys production. The workflow uses the `CLOUDFLARE_API_TOKEN` secret (the "Edit
Cloudflare Workers" template, limited to the SERP account and the zenbujapanese.com zone; it no
longer needs the D1 Edit it was created with) and the `CLOUDFLARE_ACCOUNT_ID` variable.

The `deploy:*` scripts remain for a human-run emergency only.

In `apps/web/wrangler.jsonc`, the top level is local development, and `env.staging` and
`env.production` are the deployed environments. Wrangler doesn't pass bindings down to an
environment, so each repeats them. After changing bindings or vars there, run `pnpm cf-typegen`,
which rewrites `apps/web/cloudflare-env.d.ts` from `wrangler.jsonc` alone: it reads no `.dev.vars`
(`--env-file /dev/null`), so a local secret never enters the types, and the `Web` workflow fails
when the committed file differs from what it writes.

### Dictionary service

Each deployed environment reads its own dictionary service:

- The GitHub environment's `DICTIONARY_API_URL` variable is the service's HTTPS origin, such as
  `https://dictionary.example.com`, with no path, since the site asks for `/v1/…` from it.
  `Web deploy` writes it over that environment's `DICTIONARY_API_URL` placeholder in
  `wrangler.jsonc`, the value right after the environment's `SITE_ENV`, on its line or the next
  (`src/lib/dictionary-service-deploy.test.ts` runs the script on a copy).
- The Worker's `DICTIONARY_API_TOKEN` secret is the token the service was started with. Set it by
  hand, and again to rotate it: `pnpm exec wrangler secret put DICTIONARY_API_TOKEN --env
  <staging|production>`.

`scripts/use-dictionary-service.sh` checks both before the deploy. It doesn't ask the service
itself, since Bot Fight Mode on the zone challenges CI runners. The smoke test asks through the
deployed site, at `/dictionary/service.json` (whether the site's Worker reaches its service, and
the service's build; `Cache-Control: no-store`, `noindex`), and its dictionary pages then prove the
token works. The route answers 502 unless the service answers 200, with only the kind of failure
when the Worker can't reach it (such as `TypeError` or `TimeoutError`), never its message, which
can name internal detail; it answers 404 where the site reads no service. Bot Fight Mode challenges
the Worker's request too when a CI runner sets it off, whatever headers the runner sends, and
`/dictionary/service.json` then reports the challenge: the smoke test skips its dictionary checks
with a warning, `/sitemap-index.xml` among them since it lists the service's sitemaps, and runs
them in full from a machine Cloudflare doesn't challenge, such as your own. Visitors Cloudflare
scores as bots get a 500 on dictionary pages and the sitemap index for the same reason.

The site reads whatever service its environment names, so a new service deploys before a site
change that needs it. The `Dictionary API deploy` workflow deploys the service itself
([`dictionary-api.md`](dictionary-api.md), Ship it), and `Web deploy` waits for the same commit's
service deploy to an environment to sign and tag its image, before deploying the site there
(`apps/web/scripts/wait-for-dictionary-service.sh`, which needs `GH_TOKEN` with read access to the
repository's Actions). The server pulls a tagged image on its own schedule, so for a few minutes
either one can be live without the other; the contract number makes a mismatch in that window
visible (Dictionary, above).

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

Before merging a change to environment configuration, build the site as the target environment
deploys and run the Worker with its `vars` (`SITE_ENV=production pnpm exec opennextjs-cloudflare
build`, then `pnpm exec opennextjs-cloudflare preview --env production`), then check the output.
Static pages, the header's Log in and the footer's Sign in among them (Account pages, above), come
from the build's `SITE_ENV`, so a build without it would show the local site's header and footer
beside production's pages.
Production's `DICTIONARY_API_URL` is a placeholder until `Web deploy` writes it (Dictionary
service, above), and with it every page answers 500, so name no dictionary service
(`--var DICTIONARY_API_URL: --var DICTIONARY_API_TOKEN:`). `preview` also reads `.dev.vars`, and a
local `ACCOUNT_API_URL` there opens production's account pages, so move it aside first, or serve
the build with `wrangler dev --env production --env-file /dev/null`, as the closed account spec
does (Account pages, above). `scripts/smoke.sh <url> <staging|production>` asserts the
search-engine rules for each environment, so CI fails if production is hidden or staging is
exposed.

### Canonical hosts

Each environment has one canonical host: `zenbujapanese.com` for production and
`staging.zenbujapanese.com` for staging. Every other host serving the same Worker permanently
redirects (308) to it in one hop, keeping the canonical trailing-slash form, through
`redirectHostTo` in `next.config.ts`:

- `www.zenbujapanese.com`, a custom domain on the production Worker.
- Each Worker's workers.dev URL. Wrangler enables it by default; left alone it serves a crawlable
  duplicate of the site. Keep `workers_dev` on: CI smoke-tests these URLs.

`redirectHostTo` lists its file rules before `/:path+`, which would also match files, and gives
`/` a rule of its own, since OpenNext can't fill an empty path parameter.

The zone is on the free plan, whose Bot Fight Mode blocks CI runners and cannot be skipped by WAF
rules, so CI smoke-tests the workers.dev URLs with the `x-zenbu-smoke-test` header, which exempts a
request from the host redirect. The header is not a secret. `scripts/smoke.sh` also checks, with a
retry for edge propagation, that a plain workers.dev request 308s to the canonical host.

When adding a host (a new custom domain, preview URLs), add a `redirectHostTo` rule and a smoke
check in the same change. To test host rules locally, run `wrangler dev` without `--env production`
and send a `Host` header: with that environment's custom domains, Wrangler rewrites `Host` to the
route's domain and host rules never match.

`/privacy` and `/support` must keep working: the shipped iOS app and App Store metadata link to
them. A page that moved, such as `/privacy`, is listed in `apps/web/src/lib/moved-pages.ts`, and
`worker.ts` answers it with one 308 before Next.js runs (so, like `retired.ts`, it imports no
Next.js module and no `@/` path): Next.js adds a missing trailing slash
before it reads `next.config.ts`'s redirects, so a redirect there takes two hops (`/privacy`, then
`/privacy/`, then `/legal/privacy/`). `next.config.ts` lists the same pages, so `pnpm dev`, which
doesn't run `worker.ts`, still redirects them, in those two hops.

Email Routing on the zone forwards `support@zenbujapanese.com` to `support+zenbujapanese@serp.co`
and `dmca@zenbujapanese.com` to `dmca+zenbujapanese@serp.co`.

## Sitemaps

Sitemaps are hand-written route handlers built on `src/lib/sitemap.ts`. `/sitemap-index.xml` is
the index (`/sitemap.xml` serves the same document) and lists every child sitemap under
`/sitemaps/`. A child sitemap holds at most 50,000 URLs. Add a new section's sitemap to
`childSitemaps`. Static pages are listed once, in `src/lib/pages.ts`, which also feeds the HTML
sitemap at `/sitemap`.

The dictionary's sitemaps (`src/lib/dictionary/sitemaps.ts`, ADR 0007) exist wherever the site
has a dictionary service, staging and production, not local fixtures, so the index renders per
request (`force-dynamic`, as does `/sitemap.xml`, which crawlers look for by default): a build
can't reach the service, so prerendering would fail the build or freeze an index without them.
`/dictionary/`, the search box and the browse sections below it, is listed in `src/lib/pages.ts`:

- `/sitemaps/dictionary/<n>.xml`: every word page's canonical URL under its slug,
  percent-encoded, 50,000 to a file in `ent_seq` order (five files for 218,382 words). The
  service works out each file's `ent_seq` range once, and the site streams a file's words from it
  10,000 at a time (`urlSetStream`), so a file never sits whole in memory; a failure mid-stream
  errors the response rather than ending it early.
- `/sitemaps/browse.xml`: every indexed browse page, built from what the service's
  `/v1/sitemaps/browse` lists (`src/lib/dictionary/browse/sitemap.ts`), about 5,300 URLs.
Those are the only dictionary sitemaps (ADR 0010, amended for #614): the kanji and conjugations
sitemaps went with their pages.

They're kept in the Worker's edge cache (the Cache API) under the dictionary build the service
names, so they change with the build, within the 10 minutes its answers stay cached. Cloudflare
doesn't cache a Worker's responses on its own, and `pnpm dev` has no such cache.

## Retired word URLs

A word URL whose `ent_seq` the dictionary retired answers 410 or 308 (ADR 0007; the behavior is
in the [product docs](../../apps/web/docs/product/dictionary.md#urls-seo-and-indexing)). Next.js
pages can't answer 410, so `worker.ts`, the Worker's entry in `wrangler.jsonc`, answers these
before OpenNext's worker and passes every other request on (`src/lib/dictionary/retired.ts`). It
asks the service for the retired entries once per isolate (a release retires a few hundred at
most), wherever the site has a service; when the service can't list them, the request goes on to
the app, which answers 404, or fails while the service fails. `worker.ts` bundles `retired.ts`
and what it imports (`api.ts`, `urls.ts`, `src/lib/edge-cache.ts`, and `src/lib/log.ts`) outside
Next.js, so they import no Next.js module and no `@/` path, which a Biome rule in
`apps/web/biome.json` enforces.
`pnpm dev` runs Next.js alone, so check retired URLs in `pnpm preview`. The service lists none
until #463 records retired entries.
