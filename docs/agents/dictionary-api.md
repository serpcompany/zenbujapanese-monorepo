# Dictionary service working guide

`apps/dictionary-api` is the website's dictionary service (ADR 0009): a Node service that runs the
shared core (`packages/dictionary-core`) on the app's own bundled data and answers every search,
word, kanji, example, conjugated form, sitemap, and retired-entry request the website makes.
Nothing is precomputed for a release: it reads `LanguageReferenceData.sqlite3` and its packs with
the app's own SQL when a page asks. Only the website calls it, with a bearer token. The website's side is in [`web.md`](web.md), Dictionary.

Run every command below from `apps/dictionary-api`, after `pnpm install` at the repository root.

## What it reads

The app's `apps/ios/Modules/Sources/SearchExperience/Resources`, which must be real files rather
than Git LFS pointers:

```sh
git lfs pull --include="apps/ios/Modules/Sources/SearchExperience/Resources/**"
```

- `LanguageReferenceData.sqlite3`, with `CompoundPitch`, `JLPTLevelPack`, `TUBELEXFrequencyPack`,
  `KanjiStrokeData`, `ExampleWordIndex`, and `RankedLists` attached read-only. At start the service
  refuses an artifact whose transform or example index it doesn't read, or a pack that isn't the
  one it expects (`checkArtifact`); every pack but the stroke data must be built for this
  `LanguageReferenceData.sqlite3`.
- `RankedLists.sqlite3` holds the Wikipedia and six Jiten lists' ranks, mapped to Language
  Reference IDs as the app maps them when a learner installs the pack, from their pinned sources
  ([`apps/ios/Tools/README.md`](../../apps/ios/Tools/README.md), `build_ranked_lists.py`). The app
  doesn't bundle it. With TUBELEX, which the app bundles, the service has all eight of the app's
  ranked frequency dictionaries; `checkArtifact` refuses a file that lacks one the core lists
  (`packages/dictionary-core/src/browse/lists.ts`).
- `KanjiReferenceData.json` and `KanjiElementReferenceData.json`.
- Kuromoji's files, for example word links and conjugated form examples. `src/kuromoji.ts` ports
  `apps/ios/Modules/Sources/SearchExperience/KuromojiMorphologyClient.swift`: it runs the app's
  kuromoji.js build in a bare V8 context, as the app runs it in a bare JavaScriptCore one, and
  hands it each dictionary file, still gzipped, through the app's XMLHttpRequest shim. Tokens
  come back through JSON, as the app decodes them, so an absent reading stays absent. The files
  are pinned by SHA-256, as the word-detail suite records them: new files are a new tokenizer, so
  record the suite again. The `Search parity` workflow fails a pull request that changes the port
  or the Swift without the other.
- Sudachi's dictionary, for sentence search: the SudachiDict Core the app pins in
  `LanguageTechnologyPackCatalog.json`. `pnpm sudachi` downloads it into `.sudachi/`, checking
  the download and `system.dic` against the catalog's SHA-256s, and keeps a dictionary already
  there that checks out (`scripts/fetch-sudachi.mjs` also takes the resources folder and the
  output path, which the image's build passes). `@nikkei/napi-sudachi` 0.12.0 builds the same
  sudachi.rs commit the app pins, and the service checks that commit and the app's `char.def` and
  `unk.def` before it loads. Sentence search looks up Sudachi's Mode C words, as the app's
  `SudachiJapaneseMorphologyAdapter` does. Without the dictionary the service won't start; set
  `SUDACHI_DICTIONARY=` (empty) to run it with sentence search off, where a sentence finds only
  direct matches.

## Run it

```sh
pnpm sudachi
echo "DICTIONARY_API_TOKEN=$(openssl rand -hex 24)" > .env
pnpm dev
```

`pnpm dev` restarts on changes and reads `.env`, which is never committed. It runs the TypeScript
through tsx, whose loader doesn't reach worker threads by itself, so there each thread starts from
`src/worker-dev.mjs`, which registers the loader first; the image runs the bundle. The service
hashes the artifact and Sudachi's dictionary, starts its worker threads, and answers `/healthz`
with 503 until every thread has loaded, then with its build. To run the website against it, name
it in `.dev.vars` in `apps/web` (see [`web.md`](web.md), Dictionary).

| Variable | Default | What it sets |
| --- | --- | --- |
| `DICTIONARY_API_TOKEN` | required | The bearer token every `/v1` request but the app routes' must carry, at least 16 characters. The website's Worker holds the same value. |
| `PORT` | `8788` | The HTTP port. |
| `DICTIONARY_RESOURCES` | the app's `Resources` | Where the app's files are. |
| `SUDACHI_DICTIONARY` | `.sudachi/system_core.dic` | Sudachi's dictionary; empty turns sentence search off. |
| `DICTIONARY_API_WORKERS` | CPU cores, at most 4 | How many worker threads answer requests. |
| `DICTIONARY_API_RELEASE` | `local` | A name for this build of the code, such as its commit. |
| `LANGUAGE_DATA_RELEASE_FILE` | `language-data/release.json` | The language-data release the files belong to, which the app routes name (the image copies it to `/service/language-data/release.json`). |
| `ACCOUNT_API_URL` | none | The account service's public URL, such as `https://api.zenbujapanese.com`: an app token's `iss` and `aud` must be exactly this. Unset, the app routes answer 503. |
| `ACCOUNT_JWKS_URL` | `<ACCOUNT_API_URL>/v1/auth/jwks` | Where the service reads the account service's signing keys. A slot reaches only nginx, so on the server this is a URL nginx answers with the account service's JWKS (Apps, below). It must answer `200` itself: the service follows no redirect. |
| `APP_REQUESTS_PER_MINUTE` | `60` | How many app-route requests one account may make in a minute. |

The build it reports (`X-Dictionary-Build` on every `/v1` answer but the app routes', and
`/healthz`) is the
artifact's SHA-256 prefix and the release: a new artifact or new code is a new build. It reports
its contract too (`X-Dictionary-Contract` and `/healthz`): the number of its answers' shapes, from
the core, which the website compares with its own ([`dictionary-core.md`](dictionary-core.md),
Rules).

## Routes

Every `/v1` route but the app routes (Apps, below) needs `Authorization: Bearer <token>` and
answers JSON; a query or form is one
URL-encoded path segment of at most 200 characters (`maximumQueryLength`, which the website
checks too). The routes stay clear of `/v1/auth`, `/v1/me`, `/v1/sync`, and `/v1/health`, which the
API host's nginx sends to the account service. A 404 means there's no such thing: no such word, kanji, or sitemap, a query without
examples, or an unknown route. A word number or kanji that can't exist, such as word 0, a number
past any JMdict entry, or two characters, is a 404 too. A 400 names what was malformed; a 401
means the token is missing or wrong; a 503 means the service is still starting; a 500 says nothing
more and logs the error.

| Route | Answer |
| --- | --- |
| `GET /healthz` | No token. 503 while starting; then the build, contract, and features. |
| `GET /v1/info` | The build, the artifact's name and SHA-256, the features, and `languageData`: the language-data release and the SHA-256 of each file a word card is read from. |
| `GET /v1/search/<query>` | The results screen. |
| `GET /v1/search/<query>/examples?from=` | 25 of the examples the Example Sentences row opens, from `from`. |
| `GET /v1/words/<ent_seq>` | A word page's rows, its slug, the slugs it links to, and which kanji have details (`kanjiPages`). |
| `GET /v1/words/<ent_seq>/examples?from=` | 25 more of a word's examples. |
| `GET /v1/conjugations/<form>/examples?from=&limit=` | `limit` (25, at most 100) of a conjugated form's examples from `from`, by its spelling as written, with how many it lists. |
| `GET /v1/kanji/<character>` | A kanji's rows for its details, the slugs of the words it lists, and which of its components and elements have details (`kanjiPages`). |
| `GET /v1/sitemaps/words` | Each word sitemap's `ent_seq` range. |
| `GET /v1/sitemaps/words/<n>?after=&limit=` | A sitemap's words after `after`, with their slugs. |
| `GET /v1/retired` | Retired entries and their replacements; empty until #463. |
| `GET /v1/browse` | The browse pages' totals: entries, each kana script's words, common words and the 24 most used content words among them (no particles, auxiliaries, conjunctions, copulas, or bare prefixes and suffixes), the kanji lists' sizes and grade 1's kanji, and the JLPT levels' words. |
| `GET /v1/browse/kana/<script>` | `hiragana` or `katakana`: how many words start with each kana. |
| `GET /v1/browse/kana/<script>/<kana>` | A kana's two-kana groups with their counts, the words read as that kana alone, and the kanas before and after it. |
| `GET /v1/browse/kana/<script>/<kana>/<two kana>?page=` | 200 of the words whose reading starts with the two kana, in kana order. |
| `GET /v1/browse/categories` | How many words each category lists (`packages/dictionary-core/src/browse/categories.ts`). |
| `GET /v1/browse/categories/<slug>?order=&page=` | 200 of a category's words, each with the first meaning that carries the label. `order=used` (the default) lists the words whose first meaning carries it, then the others, each most used on YouTube first, and words YouTube doesn't rank last; `order=kana` lists them all in kana order. |
| `GET /v1/browse/ranked` | Each ranked list's mapped and listed words and its top 6, and each JLPT level's words and its first 5. |
| `GET /v1/browse/ranked/<slug>?page=` | A ranked list's words a band of 1,000 ranks at a time (`page` 1 is ranks 1 to 1,000, and so on to 10, ranks 9,001 to 10,000), or 200 of a JLPT level's words (`jlpt-n5`…) in kana order. |
| `GET /v1/browse/kanji` | Each school list's kanji, most frequent first; each JLPT level's kanji count and its first 5; and how many jōyō kanji have each stroke count. |
| `GET /v1/browse/kanji/<slug>` | A kanji list (`grade-1`…`grade-6`, `secondary-school`, `jinmeiyo`, `jlpt-n5`…`jlpt-n1`, `strokes-<n>`) with each kanji's first meaning, or its base kanji's for a compatibility character KANJIDIC2 gives none. |
| `GET /v1/sitemaps/browse` | What the browse sitemap needs: every kana and its two-kana groups, each category, JLPT level, and kanji list, with their word or kanji counts, and each ranked list's words in each band, so the website can leave out lists of fewer than 10. |

### Apps

The routes under `/v1/apps` are for signed-in apps that don't bundle the language data, such as
Tomodachi (#563, #571); they are the only routes an app calls. They take an account's access token
and never the website's service token, which they refuse, and the website's routes refuse an
account token. Every error under `/v1/apps`, a missing route's `404` and a failure's `500`
included, is `{ "error": { "code": "...", "message": "..." } }`, as the account service's are.

| Route | Answer |
| --- | --- |
| `GET /v1/apps/word-cards?ids=<id>,<id>` | The word cards for 1 to 100 Language Reference IDs (`zenbu.word-cards.v1`, [`language-data/word-cards.md`](../../language-data/word-cards.md)), in the order asked, each once: `format`, `license`, `sources` (each source's notice), `cards`, `missing` (the IDs no entry has), and `languageData`. |
| `GET /v1/apps/segmentation?text=` | A text of 1 to 200 characters split into words, as the app links captions and example sentences (`zenbu.segmentation.v1`): `format`, `text`, and `tokens`, each with its `text`, its `reading` in hiragana when it has kanji, its `dictionaryForm` when that differs, and its `languageReferenceID` when it's one word, or `candidates` when it may be several; and `languageData`. |

- **The token.** The account service's access token: an EdDSA JWT whose signature checks against
  the account service's JWKS, with `iss` and `aud` both `ACCOUNT_API_URL`, an `exp`, a `sub` (the
  account), an `azp` (the app), and `dictionary:read` in its space-separated `scope`. The service
  reads the keys (`jose`'s remote key set) again once they're ten minutes old, so a key the account
  service drops stops working within ten minutes, and for a key it doesn't know at most every 30
  seconds. While the account service is down, it keeps checking tokens with the keys it last read,
  and tries again at most every 30 seconds, logging `account keys unavailable` once for each try.
  No token, or one that fails any of that, is `401 unauthorized` with `WWW-Authenticate: Bearer`;
  a token without the scope is `403 insufficient_scope`, whose `WWW-Authenticate` names the
  scope; and a token signed by a key the service can't read is `503 unavailable`. The check is in
  `src/account-tokens.ts`; the service imports nothing from the account service.
- **Bounds.** At most 100 IDs and 200 characters (`400 bad_request` past them), and
  `APP_REQUESTS_PER_MINUTE` requests a minute for each account (`sub`), counted by each server
  process, after which a request is `429 rate_limited` with `Retry-After`.
- **Caching.** An answer carries `languageData`, the language-data release and the SHA-256 of
  each file a card is read from, and is `Cache-Control: private, max-age=86400` with the build as
  its `ETag`; an error carries neither. The build changes with each deploy, so an app keeps an
  answer a day and then revalidates with `If-None-Match`; a matching tag, strong or weak, is
  `304` before any work. Cards stay right while `languageData` does: an app fetches again when
  any of it changes.
- **On the server.** A person makes the account service's JWKS reachable from the dictionary
  service's slots, which reach only nginx: an nginx location on the slots' network that proxies to
  the account service's `/v1/auth/jwks` and answers `200` itself. Then they add `ACCOUNT_API_URL`
  and `ACCOUNT_JWKS_URL` to each environment's settings (Set up the server, step 1). Until then the
  app routes answer 503.

## How it runs

The main thread hashes the artifact and Sudachi's dictionary once, checks Sudachi's pins, and serves
HTTP (Hono on Node's HTTP server). Sudachi's native module reads its configuration from the
process's environment, which only the main thread can set, so the main thread sets it
(`prepareSudachi`) before any worker thread starts. Worker threads each open the artifact
read-only, checking it, its packs, and Kuromoji's pinned files as they load, and answer calls one
at a time: SQLite is synchronous, so a slow query holds only its own thread. Each call goes to the
thread with the fewest in flight, and a thread that dies is replaced. Each thread keeps recent
searches, word examples, a query's examples, kanji details, and word lookups in LRU caches, so a
page's first request pays for a broad query and the rest don't. The browse routes don't scan the
artifact for a request: before a thread reports ready, it builds the browse index
(`packages/dictionary-core/src/artifact/browse-index.ts`) in a few passes, every word in kana
order by its first two kana and every category's words in both its orders, keeps the totals, the
category counts, the kanji and ranked lists' summaries and counts, every kanji list, and the
browse sitemap, and runs each statement a browse page asks once (`DictionaryBrowse.warm`). A
browse page then reads only its own words, with statements already prepared. The index holds
about 960,000 row IDs, the categories' as 32-bit arrays. On 2026-10-07, with two threads on this
workstation (load average 5 over the last minute, falling from 180 over fifteen), each thread was
ready about 9.4 seconds after it started, and every browse route's first request took at most 28
ms (a JLPT level's first page); before the index, the totals took 1 second and the category counts
2. Warming adds about 250 MB to a thread's resident memory, nearly all of it SQLite's cache of the
pages it read; the index itself is under 10 MB of JavaScript heap. The website's edge cache keeps
answers for 10 minutes on top.

Logs are one JSON object per line on stdout (errors on stderr): each request's method, route
pattern, status, and time. Queries never appear in the logs.

A broad query takes one to two seconds the first time: い reads 73,000 entries with the app's own
SQL, and "to" matches 50,000 Tatoeba pairs. A one-letter wildcard's examples take longer: `a*`,
`s*`, and `t*` take 3.5 to 5 seconds, `t*` matching over 100,000 pairs, which the app ranks in
full. Grapheme counts and string comparisons take exact
fast paths (`packages/dictionary-core/src/detail/text.ts`, `search/query.ts`); what remains is
the app's SQL.

## Code layout

`apps/dictionary-api/src` has three layers, and imports point down only. Biome's
`noRestrictedImports` enforces each rule (`apps/dictionary-api/biome.json`), with a message that
says where the code belongs; tests may import anything.

- The readers (`src/artifact.ts`, `src/kuromoji.ts`, `src/sudachi.ts`, and `src/account-tokens.ts`,
  which reads the account service's keys) and the shared modules (`src/config.ts`,
  `src/rate-limit.ts`, `src/service.ts`, the `DictionaryService` interface) are the bottom layer.
  They import neither of the others, nor Hono.
- The worker layer (`src/load.ts`, `src/worker.ts`, `src/pool.ts`) runs the dictionary in worker
  threads, and knows nothing of HTTP.
- The HTTP layer, `src/app.ts` and the app routes in `src/app-routes.ts`, answers from the
  `DictionaryService` that `src/server.ts` hands it, and reads nothing itself: no reader, no worker,
  no SQLite, no file. `src/server.ts` hands it the account-token check and the per-account limit
  too, so it imports only their types.

`src/server.ts` wires the three together and is imported by nothing. What the Node services share
comes from `packages/node-service` (`@zenbu/node-service`): `log()`, which writes JSON lines (a
level, a message naming the event, and fields) that the server's journal and Docker keep; the
request log, which names a route by its pattern; and the server that stops cleanly on SIGTERM.
Nothing else calls `console`, which Biome's `noRestrictedGlobals` enforces outside tests. The scripts in `apps/dictionary-api/scripts/` print
progress to a person, so they may.

## Check it

```sh
pnpm check
```

runs Biome, typecheck, Vitest, and the bundle. The tests replay the app-recorded suites
(`apps/ios/LanguageData/Conformance/`, ADR 0006) through the service's dictionary on the real
files: search retrieval, search results (every row, chip, and special row, the Example Sentences
row included), example search (every listed pair ID for 67 queries, and the first 5 sentences'
words, links, and marks), word detail (the first 25 examples' order, tokens, links, and
highlights, the counts, the furigana split, the pitch graph, each frequency row's details, and
every conjugated form's examples), and kanji detail (its metrics, Waller's JLPT level among
them). The word-detail suite's furigana, pitch graph, frequency details, and conjugations take
the shapes in `packages/dictionary-core/src/detail/suite.ts`, which the website's rendered-page
test (`apps/web/src/components/dictionary/word-page.test.tsx`) shares. Each suite pins the files
it was recorded from, and fails on others (`requirePinnedArtifacts`), since it would compare
nothing useful. A suite the app recorded with reduced text analysis runs without Sudachi, as the
app did. The results suite compares a row's first entry number only: the service keeps its
Language Reference ID's, the first of the entries the app merged into the row. Where the app's
example retrieval throws, on a headword NFKC changes such as Ｈ, the suite records the error: Word
Detail lists no examples, and neither does the page. Without the files the suites skip;
`ZENBU_REQUIRE_ARTIFACT=1` makes them fail instead, as CI does, and without Sudachi's dictionary
the retrieval suite's sentence-search cases skip. No suite records sentence search yet (recording
it needs the app's Japanese Text Analysis pack in the Simulator), so `sentence-search.test.ts`
checks the cases the app's manual checks name.
`conjugation-examples.test.ts` pages a form's examples.
`full-text.test.ts` checks English search where FTS4 differs from other engines.

The `Dictionary API` workflow runs `pnpm check` on pull requests with the Git LFS files and
Sudachi's dictionary cached, then the website's rendered-page gate against the built service. The
`Dictionary API deploy` workflow builds the Docker image and checks that it starts and answers
(see Ship it). The `Search parity` workflow pairs the core's ports with their Swift sources.

`pnpm fixtures` regenerates the core's local fixtures (`packages/dictionary-core/src/fixtures/`),
for `pnpm dev` without a service: the いる homographs and the words written with 要, with two
pages of examples for each and for each of their conjugated forms, and the kanji 要. The code the
service answers with reads them from the app's files (or the `Resources` folder given), so their
shapes can't drift from what staging and production render. It writes one row per line, so a
regenerated fixture diffs by row.

`pnpm word-cards <word list> <output folder>` exports word cards for an app that ships them, such
as Tomodachi: the format, the word list, and what an export holds are in
[`language-data/word-cards.md`](../../language-data/word-cards.md). It reads the app's files, the
release ID in `language-data/release.json`, and the notices `language-data/release-inputs.json`
names.

## Ship it

The service ships as one Docker image holding the bundled code, the app's files it reads, and
Sudachi's checked dictionary. The `Dictionary API deploy` workflow builds it, pushes it to the
GitHub Container Registry, and points each environment's tag at it; a cron job on the server
deploys what the tags name. Nothing outside the server can act on it.

### The image

Build and run it by hand from the repository root, with the Git LFS files pulled:

```sh
docker build -f apps/dictionary-api/Dockerfile --build-arg RELEASE=$(git rev-parse --short HEAD) \
  -t zenbujapanese-dictionary-api .
docker run -p 8788:8788 -e DICTIONARY_API_TOKEN=<token> zenbujapanese-dictionary-api
```

The image is about 1 GB, and uses about 750 MiB of memory with two worker threads. The kernel's
cache of the files it reads comes on top; a container's memory reading, such as `docker stats`,
counts it, but it can be reclaimed. It has a health check on `/healthz` and stops cleanly on SIGTERM.

It holds one build of the data, so a new artifact is a new image. Its layers go from what changes
least to what changes most: Kuromoji, the language data, Sudachi's dictionary, the installed
packages, the language-data release's name, and last the bundled code. A code change so makes only a new top layer of a few MB,
which is all CI pushes and the server pulls; the language data's layers, about 1 GB, are built
and moved only when the data changes. `scripts/build.mjs` bundles
`src/server.ts` and `src/worker.ts`, with the core and Hono; Sudachi's native module stays outside
the bundle, among the production dependencies the image installs. The build
context is the repository root, and `Dockerfile.dockerignore` lets in only what the `Dockerfile`
copies, so a file the image needs goes in both.

### How a deploy works

`.github/workflows/dictionary-api-deploy.yml` runs on a push to `main` that changes what the image
holds (the service, the core, what the services share, the lockfile, or the app's files it
copies), and by hand:

1. **`image`** builds the image, starts it, and checks that `/healthz` names this commit's release
   and that a search, a word, a kanji, and a search's examples answer with a token (and `/v1/info`
   doesn't without one). It then pushes it as
   `ghcr.io/serpcompany/zenbujapanese-dictionary-api:sha-<commit>` and `:main`. A pull request
   that changes the image runs only this build and check.
2. **`staging`** signs the image's digest with cosign, then moves the `:staging` tag to it.
3. **`production`** moves the `:production` tag to it, once `staging` has. The repository variable
   `DEPLOY_PRODUCTION` set to `false` stops at staging, as for the website; a run by hand still
   deploys production.

The server's deployer verifies the signature and swaps the image into the environment's slots
([`api-servers.md`](api-servers.md), The deployer). GitHub holds no access to the server: all the
workflow can do is publish an image and move a tag. The workflow doesn't wait to see the server
deploy it: Bot Fight Mode on the zone challenges CI runners, both when they ask the service and
when the website's Worker asks it for them, whatever headers they send, so nothing in CI can see
which build the service runs. The server's journal says what it deployed, and so do the service's
`/healthz` and the website's `/dictionary/service.json` in a browser. Nothing confirms staging
before production either, so with `DEPLOY_PRODUCTION` set to `false`, a person checks staging, then
runs production by hand.

The `staging` job signs keylessly: cosign gets a certificate for the run's GitHub identity, which
names this workflow and the branch it ran from. The `staging` environment only accepts `main`, so
an image a branch pushed never runs. A rollback signs its image again only after checking that
main signed it before.

- **Roll back** by running the workflow by hand with `tag` set to the version to go back to, such
  as `sha-0123456789ab`: it moves the tags to that image without building.
- **See what runs and retry a failed image** as [`api-servers.md`](api-servers.md) says, with
  `zenbujapanese.dictionary-api.slot`, `journalctl -t zenbujapanese-dictionary-api`, and
  `/var/lib/zenbujapanese-dictionary-api/`.
- **Production's first switch.** Run this workflow by hand, which moves `:production`. Within
  about 5 minutes, the deployer starts production: wait until
  `https://dictionary-api.zenbujapanese.com/healthz` answers 200 with the new build, in a browser.
  Then run `Web deploy` by hand.
- **The service ships before the site.** The website reads whatever its environment's service
  answers, so before `Web deploy` deploys an environment, it waits for the same commit's service
  deploy to have signed and tagged the image for that environment
  (`apps/web/scripts/wait-for-dictionary-service.sh`), and stops if that deploy failed, skipped
  the environment, or was cancelled. The server swaps the image in within about 5 minutes of the
  tag moving, so a site can go out a few minutes ahead of its service; nothing in CI can see the
  swap. A commit that doesn't change the service deploys the site at once.
- **Moving to the slots' network.** A slot on `web_network`, which an earlier deployer started, is
  never taken as current: the next deploy of a signed image replaces it with one on the slots'
  network. Docker's DNS answers nginx from `web_network` while the old slot is there, so nginx
  learns the new slot only once the old one stops, so that one deploy answers 502 or 504 for about
  10 seconds while nginx gives up the old address. It happens once, on staging; production's first
  deploy starts on the slots' network.

### Set up the server

First set up what the services share: cosign, the deployer, and registry access
([`api-servers.md`](api-servers.md), Set up the server). The dictionary service's two environments
need about 1.5 GB of memory between them, and 5 GB of disk for images. Then, as root:

1. **Each environment's token**, which its service reads when it starts. An environment without
   its file isn't deployed. Staging runs one worker thread, production two:
   ```sh
   sudo install -d -m 700 /etc/zenbujapanese-dictionary-api
   for environment in staging production; do
     workers=$([ "$environment" = production ] && echo 2 || echo 1)
     printf 'DICTIONARY_API_TOKEN=%s\nDICTIONARY_API_WORKERS=%s\n' "$(openssl rand -hex 24)" "$workers" |
       sudo tee /etc/zenbujapanese-dictionary-api/$environment.env >/dev/null
     sudo chmod 600 /etc/zenbujapanese-dictionary-api/$environment.env
   done
   ```
   Set each environment's Worker to its token ([`web.md`](web.md), Dictionary service).

   **The app routes.** Once the account service runs in an environment and nginx answers its JWKS
   on the slots' network (Apps), add both to that environment's file. A slot reads the file when
   it starts, so the next deploy takes them up:
   ```sh
   printf 'ACCOUNT_API_URL=%s\nACCOUNT_JWKS_URL=%s\n' "$account_url" "$jwks_url" |
     sudo tee -a /etc/zenbujapanese-dictionary-api/$environment.env >/dev/null
   ```
2. **nginx.** The nginx repository holds `nginx/dictionary-api-staging.zenbujapanese.com.conf` and
   `nginx/dictionary-api.zenbujapanese.com.conf` ([`api-servers.md`](api-servers.md), Set up the
   server, step 4).

   **The slots' network.** Create it, internal, and connect the running nginx to it:
   ```sh
   docker network create --internal zenbujapanese-dictionary-api
   docker network connect zenbujapanese-dictionary-api nginx
   ```
   Docker's DNS still resolves the other sites' containers on `web_network`, and the slots'
   aliases on the slots' network.
3. **Cloudflare**: proxied DNS records for `dictionary-api.zenbujapanese.com` and
   `dictionary-api-staging.zenbujapanese.com` ([`api-servers.md`](api-servers.md), Set up the
   server, step 5). Bot Fight Mode challenges the website's Worker too when a runner sets it off,
   so CI doesn't check the service (How a deploy works, above).
4. **The GitHub environments**, which hold only each service's URL:
   ```sh
   gh variable set DICTIONARY_API_URL --env staging --body https://dictionary-api-staging.zenbujapanese.com
   gh variable set DICTIONARY_API_URL --env production --body https://dictionary-api.zenbujapanese.com
   ```
5. **The first deploy.** Run the workflow by hand (Actions → Dictionary API deploy → Run
   workflow); the deployer starts each image within 5 minutes of its tag moving. Then run
   `Web deploy`. For production, see its first switch, above.
