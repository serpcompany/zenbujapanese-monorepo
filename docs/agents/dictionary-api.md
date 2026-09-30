# Dictionary service working guide

`apps/dictionary-api` is the website's dictionary service (ADR 0009): a Node service that runs the
shared core (`packages/dictionary-core`) on the app's own bundled data and answers every search,
word, kanji, example, conjugation, sitemap, and retired-entry request the website makes. Nothing is
precomputed for a release: it reads `LanguageReferenceData.sqlite3` and its packs with the app's own
SQL when a page asks, and works out the conjugations sitemap once when it starts. Only the website
calls it, with a bearer token. The website's side is in [`web.md`](web.md), Dictionary.

Run every command below from `apps/dictionary-api`, after `pnpm install` at the repository root.

## What it reads

The app's `apps/ios/Modules/Sources/SearchExperience/Resources`, which must be real files rather
than Git LFS pointers:

```sh
git lfs pull --include="apps/ios/Modules/Sources/SearchExperience/Resources/**"
```

- `LanguageReferenceData.sqlite3`, with `CompoundPitch`, `JLPTLevelPack`, `TUBELEXFrequencyPack`,
  `KanjiStrokeData`, and `ExampleWordIndex` attached read-only. At start the service refuses an
  artifact whose transform or example index it doesn't read, or a pack that isn't the one it
  expects (`checkArtifact`); every pack but the stroke data must be built for this
  `LanguageReferenceData.sqlite3`.
- `KanjiReferenceData.json` and `KanjiElementReferenceData.json`.
- Kuromoji's files, pinned by SHA-256 and loaded through the app's XMLHttpRequest shim
  (`src/kuromoji.ts`), for example word links and conjugated form examples.
- Sudachi's dictionary, for sentence search: the SudachiDict Core the app pins in
  `LanguageTechnologyPackCatalog.json`. `pnpm sudachi` downloads it into `.sudachi/`, checking
  the download and `system.dic` against the catalog's SHA-256s. `@nikkei/napi-sudachi` 0.12.0
  builds the same sudachi.rs commit the app pins, and the service checks that commit and the
  app's `char.def` and `unk.def` before it loads. Without the dictionary the service won't
  start; set `SUDACHI_DICTIONARY=` (empty) to run it with sentence search off, where a sentence
  finds only direct matches.

## Run it

```sh
pnpm sudachi
echo "DICTIONARY_API_TOKEN=$(openssl rand -hex 24)" > .env
pnpm dev
```

`pnpm dev` restarts on changes and reads `.env`, which is never committed. The service hashes the
artifact and Sudachi's dictionary, starts its worker threads, and answers `/healthz` with 503
until every thread has loaded, then with its build. To run the website against it, name it in
`apps/web/.dev.vars` (see [`web.md`](web.md), Dictionary).

| Variable | Default | What it sets |
| --- | --- | --- |
| `DICTIONARY_API_TOKEN` | required | The bearer token every `/v1` request must carry, at least 16 characters. The website's Worker holds the same value. |
| `PORT` | `8788` | The HTTP port. |
| `DICTIONARY_RESOURCES` | the app's `Resources` | Where the app's files are. |
| `SUDACHI_DICTIONARY` | `.sudachi/system_core.dic` | Sudachi's dictionary; empty turns sentence search off. |
| `DICTIONARY_API_WORKERS` | CPU cores, at most 4 | How many worker threads answer requests. |
| `DICTIONARY_API_RELEASE` | `local` | A name for this build of the code, such as its commit. |

The build it reports (`X-Dictionary-Build` on every `/v1` answer, and `/healthz`) is the
artifact's SHA-256 prefix and the release: a new artifact or new code is a new build.

## Routes

Every `/v1` route needs `Authorization: Bearer <token>` and answers JSON; a query or form is one
URL-encoded path segment of at most 200 characters (`maximumQueryLength`, which the website
checks too). A 404 means there's no such thing: no such word, kanji, or sitemap, a query without
examples, or an unknown route. A word number or kanji that can't exist, such as word 0, a number
past any JMdict entry, or two characters, is a 404 too. A 400 names what was malformed; a 401
means the token is missing or wrong; a 503 means the service is still starting, or, for the
conjugations sitemap, still working it out, with `Retry-After`; a 500 says nothing more and logs
the error.

| Route | Answer |
| --- | --- |
| `GET /healthz` | No token. 503 while starting; then the build and features. |
| `GET /v1/info` | The build, the artifact's name and SHA-256, and the features. |
| `GET /v1/search/<query>` | The results screen, and whether a one-kanji query's kanji has a page. |
| `GET /v1/search/<query>/examples?from=` | 25 of the examples the Example Sentences row opens, from `from`. |
| `GET /v1/words/<ent_seq>` | A word page's rows, its slug, the slugs it links to, and its kanji pages. |
| `GET /v1/words/<ent_seq>/examples?from=` | 25 more of a word's examples. |
| `GET /v1/words/<ent_seq>/conjugations` | What a word's conjugation pages show: its rows without examples, and its slug; 404 for a word without a table. |
| `GET /v1/conjugations/<form>/examples?from=&limit=` | `limit` (25, at most 100) of a conjugated form's examples from `from`, by its spelling as written, with how many it lists. |
| `GET /v1/kanji/<character>` | A kanji page's rows, whether it's indexable, and its links. |
| `GET /v1/sitemaps/words` | Each word sitemap's `ent_seq` range. |
| `GET /v1/sitemaps/words/<n>?after=&limit=` | A sitemap's words after `after`, with their slugs. |
| `GET /v1/sitemaps/kanji` | Every indexable kanji. |
| `GET /v1/sitemaps/conjugations` | Every word with a conjugation table, and its form pages search engines may index; 503 until it's worked out. |
| `GET /v1/retired` | Retired entries and their replacements; empty until #463. |

## How it runs

The main thread hashes the artifact and Sudachi's dictionary once, checks Sudachi's pins, and serves
HTTP (Hono on Node's HTTP server). Worker threads each open the artifact read-only, checking it, its
packs, and Kuromoji's pinned files as they load, and answer calls; each call goes to the thread with
the fewest in flight, and a thread that dies is replaced. Each thread keeps recent searches, word
examples, a query's examples, kanji pages, and word lookups in LRU caches, so a page's first request
pays for a broad query and the rest don't. The website's edge cache keeps answers for 10 minutes on
top.

Logs are one JSON object per line on stdout (errors on stderr): each request's method, route
pattern, status, and time. Queries never appear in the logs.

Once every thread has loaded, the main thread starts one more worker thread for the conjugations
sitemap: every JMdict word the core conjugates (20,364), and which of their forms' pages list
examples (13,168). Asking each form as its page does would take hours, so
`formsWithExamples` (`packages/dictionary-core/src/artifact/conjugation-sitemap.ts`) finds every
spelling's sentences in one pass over all of them, with a trie of the spellings, ranks each
spelling's as the app's Japanese search does, and runs Kuromoji on them until one reads the form
as one word. It takes about half a minute and about 800 MB more memory, then the thread exits; a
failure is tried again a minute later, three attempts in all. The main thread keeps the answer.

A broad query takes one to two seconds the first time: い reads 73,000 entries with the app's own
SQL, and "to" matches 50,000 Tatoeba pairs. A one-letter wildcard's examples take longer: `a*`,
`s*`, and `t*` take 3.5 to 5 seconds, `t*` matching over 100,000 pairs, which the app ranks in
full. Grapheme counts and string comparisons take exact
fast paths (`packages/dictionary-core/src/detail/text.ts`, `search/query.ts`); what remains is
the app's SQL.

## Check it

```sh
pnpm check
```

runs Biome, typecheck, Vitest, and the bundle. The tests replay the app-recorded suites
(`apps/ios/LanguageData/Conformance/`, ADR 0006) through the service's dictionary on the real
files: search retrieval, search results (every row, chip, and special row, the Example Sentences
row included), example search (every listed pair ID for 67 queries, and the first 5 sentences'
words, links, and marks), word detail (the first 25 examples' order, tokens, links, and
highlights, the counts, and every conjugated form's examples), and kanji detail. Without the files
they skip; `ZENBU_REQUIRE_ARTIFACT=1` makes them fail instead, as CI does. No suite records
sentence search yet (recording it needs the app's Japanese Text Analysis pack in the Simulator),
so `sentence-search.test.ts` checks the cases the app's manual checks name.
`conjugation-examples.test.ts` pages a form's examples, and `conjugation-sitemap.test.ts` holds
the sitemap's one pass to each form's own list on every form the word-detail suite records.
`full-text.test.ts` checks English search where FTS4 differs from other engines.

The `Dictionary API` workflow runs `pnpm check` on pull requests with the Git LFS files and
Sudachi's dictionary cached, then the website's rendered-page gate against the built service, then
the Docker image build. The `Search parity` workflow pairs the core's ports with their Swift
sources.

`pnpm fixtures` regenerates the core's local fixtures (`packages/dictionary-core/src/fixtures/`)
with the service's readers, for `pnpm dev` without a service.

## Ship it

The service ships as one Docker image holding the bundled code, the app's files it reads, and
Sudachi's checked dictionary, so it runs on any container host: a VM, bare metal, or Cloudflare
Containers. Build it from the repository root with the Git LFS files pulled:

```sh
docker build -f apps/dictionary-api/Dockerfile --build-arg RELEASE=$(git rev-parse --short HEAD) \
  -t zenbujapanese-dictionary-api .
docker run -p 8788:8788 -e DICTIONARY_API_TOKEN=<token> zenbujapanese-dictionary-api
```

The image is about 1 GB, and uses about 750 MiB of memory with two worker threads, and about
1.4 GB for the half minute after it starts, while it works out the conjugations sitemap. The
kernel's cache of the files it reads comes on top (about 600 MB once the sitemap has read every
sentence); a container's memory reading, such as `docker stats`, counts it, but it can be
reclaimed. It has a
health check on `/healthz` and stops cleanly on SIGTERM.

The host isn't chosen yet (ADR 0009). Whatever it is, each environment needs:

- The service at an HTTPS origin the website's Worker can reach, which the environment's
  `DICTIONARY_API_URL` GitHub variable names.
- The same token in the service's `DICTIONARY_API_TOKEN` and the Worker's `DICTIONARY_API_TOKEN`
  secret.
- A new image for each new artifact or service change, deployed before any website change that
  needs it. The website shows a new build within 10 minutes, as its edge cache expires; a
  conjugated form's examples in the word page's sheet, which name no build, can stay in a
  browser's cache for an hour.

Staging and production can't deploy the website until their service exists: `Web deploy` stops
when the service's URL, token, or health check is missing.
