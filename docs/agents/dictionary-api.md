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
it in `apps/web/.dev.vars` (see [`web.md`](web.md), Dictionary).

| Variable | Default | What it sets |
| --- | --- | --- |
| `DICTIONARY_API_TOKEN` | required | The bearer token every `/v1` request must carry, at least 16 characters. The website's Worker holds the same value. |
| `PORT` | `8788` | The HTTP port. |
| `DICTIONARY_RESOURCES` | the app's `Resources` | Where the app's files are. |
| `SUDACHI_DICTIONARY` | `.sudachi/system_core.dic` | Sudachi's dictionary; empty turns sentence search off. |
| `DICTIONARY_API_WORKERS` | CPU cores, at most 4 | How many worker threads answer requests. |
| `DICTIONARY_API_RELEASE` | `local` | A name for this build of the code, such as its commit. |

The build it reports (`X-Dictionary-Build` on every `/v1` answer, and `/healthz`) is the
artifact's SHA-256 prefix and the release: a new artifact or new code is a new build. It reports
its contract too (`X-Dictionary-Contract` and `/healthz`): the number of its answers' shapes, from
the core, which the website compares with its own ([`dictionary-core.md`](dictionary-core.md),
Rules).

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
| `GET /healthz` | No token. 503 while starting; then the build, contract, and features. |
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
HTTP (Hono on Node's HTTP server). Sudachi's native module reads its configuration from the
process's environment, which only the main thread can set, so the main thread sets it
(`prepareSudachi`) before any worker thread starts. Worker threads each open the artifact
read-only, checking it, its packs, and Kuromoji's pinned files as they load, and answer calls one
at a time: SQLite is synchronous, so a slow query holds only its own thread. Each call goes to the
thread with the fewest in flight, and a thread that dies is replaced. Each thread keeps recent
searches, word examples, a query's examples, kanji pages, and word lookups in LRU caches, so a
page's first request pays for a broad query and the rest don't. The website's edge cache keeps
answers for 10 minutes on top.

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

## Code layout

`apps/dictionary-api/src` has three layers, and imports point down only. Biome's
`noRestrictedImports` enforces each rule (`apps/dictionary-api/biome.json`), with a message that
says where the code belongs; tests may import anything.

- The readers (`src/artifact.ts`, `src/kuromoji.ts`, `src/sudachi.ts`) and the shared modules
  (`src/config.ts`, `src/log.ts`, `src/service.ts`, the `DictionaryService` interface) are the
  bottom layer. They import neither of the others, nor Hono.
- The worker layer (`src/load.ts`, `src/worker.ts`, `src/pool.ts`) runs the dictionary in worker
  threads, and knows nothing of HTTP.
- The HTTP layer, `src/app.ts`, answers from the `DictionaryService` that `src/server.ts` hands it,
  and reads nothing itself: no reader, no worker, no SQLite, no file.

`src/server.ts` wires the three together and is imported by nothing. The service logs JSON lines
through `log()` in `src/log.ts` (a level, a message naming the event, and fields), which the
server's journal and Docker keep; nothing else calls `console`, which Biome's
`noRestrictedGlobals` enforces outside tests. The scripts in `apps/dictionary-api/scripts/` print
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
every conjugated form's examples), and kanji detail (all but JLPT, which the app's cases don't
record). The word-detail suite's furigana, pitch graph, frequency details, and conjugations take
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
`conjugation-examples.test.ts` pages a form's examples, and `conjugation-sitemap.test.ts` holds
the sitemap's one pass to each form's own list on every form the word-detail suite records.
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

The image is about 1 GB, and uses about 750 MiB of memory with two worker threads, and about
1.4 GB for the half minute after it starts, while it works out the conjugations sitemap. The
kernel's cache of the files it reads comes on top (about 600 MB once the sitemap has read every
sentence); a container's memory reading, such as `docker stats`, counts it, but it can be
reclaimed. It has a health check on `/healthz` and stops cleanly on SIGTERM.

It holds one build of the data, so a new artifact is a new image. `scripts/build.mjs` bundles
`src/server.ts` and `src/worker.ts`, with the core and Hono; Sudachi's native module stays outside
the bundle, among the production dependencies the image installs. The build
context is the repository root, and `Dockerfile.dockerignore` lets in only what the `Dockerfile`
copies, so a file the image needs goes in both.

### How a deploy works

`.github/workflows/dictionary-api-deploy.yml` runs on a push to `main` that changes what the image
holds (the service, the core, the lockfile, or the app's files it copies), and by hand:

1. **`image`** builds the image, starts it, and checks that `/healthz` names this commit's release
   and that a search, a word, a kanji, and a search's examples answer with a token (and `/v1/info`
   doesn't without one). It then pushes it as
   `ghcr.io/serpcompany/zenbujapanese-dictionary-api:sha-<commit>` and `:main`. A pull request
   that changes the image runs only this build and check.
2. **`staging`** signs the image's digest with cosign, then moves the `:staging` tag to it.
3. **`production`** moves the `:production` tag to it, once `staging` has. The repository variable
   `DEPLOY_PRODUCTION` set to `false` stops at staging, as for the website; a run by hand still
   deploys production.

GitHub holds no access to the server: all the workflow can do is publish an image and move a tag.
The workflow doesn't wait to see the server deploy it: Bot Fight Mode on the zone challenges CI
runners, both when they ask the service and when the website's Worker asks it for them, whatever
headers they send, so nothing in CI can see which build the service runs. The server's journal
says what it deployed (below), and so do the service's `/healthz` and the website's
`/dictionary/service.json` in a browser. Nothing confirms staging before production either, so
with `DEPLOY_PRODUCTION` set to `false`, a person checks staging, then runs production by hand.

**Only main's images run.** Anyone who can push to the package can push an image and move a tag,
including a workflow run from any branch, so the tag alone decides nothing. The `staging` job signs
the digest keylessly: cosign gets a certificate for the run's GitHub identity, which names this
workflow and the branch it ran from, and records the signature in Sigstore's public transparency
log. The `staging` environment only accepts `main`, and the deployer runs an image only when
`cosign verify` finds a signature from
`.github/workflows/dictionary-api-deploy.yml@refs/heads/main`, so an image a branch pushed never
runs. A rollback signs its image again only after checking that main signed it before.

On the server, cron runs `deploy/deployer.sh` as root every 5 minutes. It asks the registry which
image each tag names (`docker pull`, which fetches only the tag's manifest unless it names a new
image), and when one changed, deploys it. It takes no input and reads no environment variable, so
changing what it does takes root on the server; a change to the script in this repository reaches
the server only when someone installs it there. Each environment runs in one of two slots on the
`zenbujapanese-dictionary-api` Docker network, both answering to the environment's network alias
(`zenbujapanese-dictionary-api-staging` or `-production`). That network is internal and holds only
the slots and the server's nginx, which is on `web_network` too: a slot reaches nginx and nothing
else, neither the server's other containers nor the internet, since the service parses untrusted
input with native code (Sudachi, SQLite). nginx, which fronts the server's other sites too
(serpcompany's nginx repository), resolves the alias every 5 seconds and sends a request one slot
can't answer, because it's stopped, to the other. The deployer deploys nothing while the network is
missing, isn't internal, or doesn't have nginx on it, since a slot there couldn't serve. A deploy
starts the new image in the free slot without the alias, so nginx sends it nothing while it
starts; waits until its `/healthz` names the image's release (each check may take 3 seconds, and
the whole wait 3 minutes); gives it the alias, by reconnecting it to the network, since Docker
can't add an alias to a connected container; waits 10 seconds more, past nginx's 5-second resolver
cache, so nginx has seen it; then stops the old one. That's about 20 seconds, with no request
dropped and nginx never reloaded. A new image that doesn't come up is removed, the old one keeps
serving, and that image isn't tried again until the tag moves (below). Every container is capped
(4 GB of memory, 4 CPUs, 512 processes, 30 MB of logs) and runs as user 1000 (the node image's
`node`), whatever the image says, with no capabilities and a read-only file system; an image that
declares a volume is refused, and a removed container's volumes go with it. So no image can starve
the server's other services or change the server. The deployer touches only the containers it
started, by the ID Docker gave it, and this repository's images, and never nginx.

A few details keep a deploy safe. Runs take a lock in `/run`, where only root can create one, since
a deploy can outlast 5 minutes; a run that finds it taken logs that and skips. Each run keeps the
registry login and the IDs of the containers it starts in a folder only root can open, removed when
the run ends. A deploy first removes the environment's stopped slot containers, freeing their
slots, and treats any container with a slot's name as taking it. It runs the new container by its
image's digest, the one cosign verified, and gives it a restart policy only once it answers, so a
crash shows at once rather than as a restart loop. The old slot gets SIGTERM and 30 seconds to
finish its requests. A run that finds the tag's image in a slot a deploy was cut short on finishes
the deploy: once it answers as the tag's release, it gets the alias and the restart policy, and the
other slot stops; one that doesn't answer is removed, unless it has the alias, since it's serving.
After a deploy, the deployer removes this repository's images that no slot uses, except the ones
the deploy replaced, which a rollback deploys again, and the ones the tags name. It removes an
image by its references in this repository, so an image another repository also names stays, and
it lists every image rather than filtering them by reference, since `--filter reference=` leaves
out an image pulled by digest alone.

- **Roll back** by running the workflow by hand with `tag` set to the version to go back to, such
  as `sha-0123456789ab`: it moves the tags to that image without building.
- **See what runs** on the server: `docker ps --filter label=zenbujapanese.dictionary-api.slot`,
  and what the deployer did: `journalctl -t zenbujapanese-dictionary-api`. It logs every run that
  skips something: an environment that isn't set up, an image main didn't sign, an image that
  failed before, and a run that found an earlier one still deploying.
- **Retry a failed image.** An image that didn't come up is recorded, with when and why, in
  `/var/lib/zenbujapanese-dictionary-api/failed-<environment>`, and skipped until the tag moves.
  When it failed for a reason that wasn't the image's (the server restarting Docker mid-deploy),
  delete that file to try it again on the next run.
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

Staging and production share one server: the Linux x86-64 server whose nginx container, on the
`web_network` Docker network, fronts serpcompany's other sites through Cloudflare. The slots run on
a network of their own that nginx joins as well (step 4). The two
services need about 1.5 GB of memory between them, plus about 1.4 GB more for the half minute after
a deploy starts one, and 5 GB of disk for images. A person with root sets it up once:

1. **cosign**, which the deployer verifies each image's signature with: the version the workflow
   signs with, checked against its release's SHA-256 (for an arm64 server, `cosign-linux-arm64`
   and `c5d324e091826b0d7a78eb16fef316450b4eb9aaec045611c08ba06f5e73220a`). The server needs
   outbound HTTPS to Sigstore (`tuf-repo-cdn.sigstore.dev`) for its trust root:
   ```sh
   curl -fsSLo cosign https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-amd64
   echo '4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71  cosign' | sha256sum --check
   sudo install -m 755 cosign /usr/local/bin/cosign && rm cosign
   ```
   Without it, the deployer deploys nothing, and says so.
2. **The deployer**, from `deploy/deployer.sh`, run every 5 minutes and stopped after 25. It needs
   `logger`, `flock`, and `timeout`, which Ubuntu and Debian have:
   ```sh
   sudo install -m 755 deployer.sh /usr/local/bin/zenbujapanese-dictionary-api-deployer
   echo '*/5 * * * * root timeout 25m /usr/local/bin/zenbujapanese-dictionary-api-deployer >/dev/null 2>&1' |
     sudo tee /etc/cron.d/zenbujapanese-dictionary-api >/dev/null
   sudo chmod 644 /etc/cron.d/zenbujapanese-dictionary-api
   ```
   Reinstall it this way after changing it; nothing else updates it.
3. **Each environment's token**, which its service reads when it starts. An environment without
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
4. **nginx.** The nginx repository holds each environment's site,
   `nginx/dictionary-api-staging.zenbujapanese.com.conf` and
   `nginx/dictionary-api.zenbujapanese.com.conf`: the `zenbujapanese.com` Cloudflare origin
   certificate (`nginx_certs/zenbujapanese_com_cert.pem` and `_key.pem`) and Cloudflare's client
   certificate, as the other sites have, the network alias resolved every 5 seconds, and failover
   to the other slot. Adding them is the one change nginx ever needs: pull them on the server, then
   check and reload it, which keeps the container and every other site running:
   ```sh
   docker exec nginx nginx -t && docker exec nginx nginx -s reload
   ```
   A staging host name has one level (`dictionary-api-staging.zenbujapanese.com`), since the
   origin certificate covers `*.zenbujapanese.com` alone.

   **The slots' network.** Create it, internal, and connect the running nginx to it. Connecting
   adds a second network: nginx keeps `web_network` and every other site, and doesn't restart.
   ```sh
   docker network create --internal zenbujapanese-dictionary-api
   docker network connect zenbujapanese-dictionary-api nginx
   ```
   The nginx repository's `docker-compose.yml` lists it for nginx too (as an external network), so a
   recreated nginx joins both. Docker's DNS still resolves the other sites' containers on
   `web_network`, and the slots' aliases on the slots' network.
5. **Cloudflare**, in the `zenbujapanese.com` zone: proxied DNS records for
   `dictionary-api.zenbujapanese.com` and `dictionary-api-staging.zenbujapanese.com`, pointing at
   the server, and Authenticated Origin Pulls on (SSL/TLS → Origin Server), since the sites accept
   only Cloudflare's client certificate. The zone's Bot Fight Mode, which stays on and can't be
   skipped per host name, challenges CI runners, and the website's Worker too when a runner sets
   it off, so CI doesn't check the service (How a deploy works, above).
6. **The GitHub environments**, which hold only each service's URL:
   ```sh
   gh variable set DICTIONARY_API_URL --env staging --body https://dictionary-api-staging.zenbujapanese.com
   gh variable set DICTIONARY_API_URL --env production --body https://dictionary-api.zenbujapanese.com
   ```
7. **The first deploy.** Run the workflow by hand (Actions → Dictionary API deploy → Run
   workflow); the deployer starts each image within 5 minutes of its tag moving. Then run
   `Web deploy`. For production, see its first switch, above.

The workflow's first push creates the image's package in the serpcompany organization
(github.com/orgs/serpcompany/packages), private, as new packages are, and the image's
`org.opencontainers.image.source` label links it to this repository. The deployer pulls it with a
GitHub token (classic) with only the `read:packages` scope, authorized for the organization's SSO
if it has one, which it reads from a root-only file on every run:

```sh
read -rsp 'Token: ' token && echo
printf 'GHCR_USERNAME=%s\nGHCR_TOKEN=%s\n' <github user> "$token" |
  sudo tee /etc/zenbujapanese-dictionary-api/registry.env >/dev/null
sudo chmod 600 /etc/zenbujapanese-dictionary-api/registry.env
unset token
```

`read -s` takes the token without echoing it, so it stays out of the terminal and the shell's
history.

It logs in for that run only, from a folder only root can open that's removed when the run ends,
so no login stays on the server. Replace the file to change the token. If the token expires or
its account loses access, the deployer's journal says it couldn't read the tag from the registry.
Without the file it pulls without a login, which works once an organization owner makes the
package public (Package settings → Change visibility).
