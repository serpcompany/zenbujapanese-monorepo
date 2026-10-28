# Architecture

A map of the repository's parts, how data moves between them, and the rules that keep each part's
layers apart. Each part's own doc has the detail; each rule here is enforced by a check.

## Parts

| Part | What it is | Its doc |
| --- | --- | --- |
| `apps/ios` | The Zenbu Japanese app, in SwiftUI, built from one target for iPhone, iPad, and the Mac (ADR 0015), with a share-sheet extension on iPhone and iPad (ADR 0017). It reads the language data bundled with it, which the importers in `language-data/tools` build, answers every dictionary screen with the shared core, which it runs in JavaScriptCore, and signs in to the account service to sync known words, lists, notes, photos and the profile photo, settings, recent lookups, watch history, bookmarked translations, and the profile's name and username, with the subscription that unlocks syncing sold through StoreKit 2 (ADR 0019). Its Shortcuts actions open it with links in its own scheme. `apps/ios/Tools/TranslateReplay` replays recorded Translate audio on a Mac. | [`docs/agents/ios.md`](docs/agents/ios.md) |
| `apps/web` | zenbujapanese.com: Next.js on Cloudflare Workers through OpenNext. Its dictionary pages read the dictionary service; its account pages call the account service from the learner's browser. | [`docs/agents/web.md`](docs/agents/web.md) |
| `apps/dictionary-api` | The dictionary service: Node, in a Docker image on serpcompany's server, answering the website's dictionary requests by running the shared core on the app's language data. | [`docs/agents/dictionary-api.md`](docs/agents/dictionary-api.md) |
| `apps/extension` | The Zenbu Japanese browser extension for Chrome, in Manifest V3, rebuilt here to read the shared language data (ADR 0006); offline and with no account in its first version: a side panel, which the toolbar icon opens, and a Settings page in React on `@zenbu/ui`, a service worker, and an offscreen document whose dedicated worker downloads a language-data release from `data.zenbujapanese.com` and answers from it offline with the shared core, on sqlite-wasm. Pages and content scripts reach that worker only by messages, and a content script draws on a page inside a shadow root. On a YouTube watch page its content script follows the video, and the service worker fetches the video's Japanese captions from YouTube. | [`docs/agents/extension.md`](docs/agents/extension.md) |
| `apps/account-api` | The account service: Node and Postgres on the same server, for Zenbu accounts, sign-in, and sync (ADR 0013). It signs learners in with Apple, Google, or an emailed code, through Better Auth, and issues the access tokens other services check. It keeps the subscription a learner buys in the App Store or through Stripe, which can unlock sync (ADR 0019). | [`docs/agents/account-api.md`](docs/agents/account-api.md) |
| `packages/dictionary-core` | The shared TypeScript core: search, results, word and kanji detail, examples, and caption rules. The service and the app both run all of it; the browser extension runs all but search (ADR 0008, ADR 0006's issue 956 amendment). | [`docs/agents/dictionary-core.md`](docs/agents/dictionary-core.md) |
| `packages/ui` | The website's look as a package, `@zenbu/ui`: the shadcn primitives, the theme, and the word components (the word header, the word page's sections, kanji details, example lists, conjugations, frequency, and source credits). It draws what the core answers, with the text, links, and actions each client passes it, so the browser extension can show what the website shows (#954). | [`docs/agents/ui.md`](docs/agents/ui.md) |
| `packages/node-service` | What the two Node services share: JSON-line logs, the request log, a server that stops cleanly, the check of an account's access token, and the writer of their API references (`docs/api/`). | [`docs/agents/dictionary-api.md`](docs/agents/dictionary-api.md), Code layout |
| `packages/account-rules` | The one definition of each rule a learner's account input is held to (a name, a username, a sign-in code, a list's name, a note, a watch, a setting), with a case file of inputs and outcomes for each: the account service applies them, the website checks with them before sending, and the app runs their bundle in JavaScriptCore. It also holds how a client that keeps no copy reads and changes the account's synced data, which the website runs. | [`docs/agents/account-rules.md`](docs/agents/account-rules.md) |
| `deploy` | The API servers' deployer, which swaps each service's signed image into its slots, and can tell a Slack channel what it deployed and what failed. Its tests are in `tools/checks/src/deployer/`. | [`docs/agents/api-servers.md`](docs/agents/api-servers.md), [`docs/agents/deployer-alerts.md`](docs/agents/deployer-alerts.md) |
| `language-data` | What every client's language data comes from: the pinned sources, the importers that build the app's bundled data from them, the conformance suites every client passes, and the release, with the pipeline that packages and publishes that data as a versioned artifact (ADR 0006). | [`language-data/README.md`](language-data/README.md) |
| `tools/checks` | This repository's own checks and tools: the script that hands each checkout its local ports, the pull request checks, the code review's scripts, the weekly maintenance report, and the tests of what has no package of its own: the workflows, the hooks, the agent settings, and the server's deployer. `pnpm verify` runs SERP's shared checks from `@serpcompany/verify`, configured by `verify.json`. | [`docs/agents/code.md`](docs/agents/code.md), [`docs/agents/checks.md`](docs/agents/checks.md) |

## How data moves

```mermaid
flowchart LR
    Sources[("Upstream sources: JMdict, KANJIDIC2, Tatoeba, ...")] --> Tools["language-data/tools importers"]
    Tools --> Data[("LanguageReferenceData.sqlite3 and packs, in apps/ios")]
    Data --> App["App for iPhone, iPad, and Mac"]
    Data --> Release["language-data release"]
    Release -->|"downloaded once, then updates"| ExtensionWorker
    Data --> Image["Dictionary service image"]
    Core["packages/dictionary-core"] --> Image
    Core -->|"a bundle of it, checked in"| App
    Image --> Server["Server: two slots behind nginx"]
    Server -->|"bearer token, through Cloudflare"| Site["Website Worker"]
    Server -->|"word cards and segmentation, for an account's access token"| Apps["Signed-in apps, such as Tomodachi"]
    Core --> UI["packages/ui: the word components"]
    UI --> Site
    UI --> Extension["Browser extension: pages and content scripts"]
    Extension -->|"messages, through the service worker and the offscreen document"| ExtensionWorker["Extension's dictionary worker"]
    Core --> Site
    Core -->|"word-cards command"| Cards[("Baked word cards")]
    Cards --> Apps
    Accounts["Account service image"] --> Server
    App -->|"sign-in and sync, through Cloudflare"| Server
    Server --- Postgres[("Postgres, on the server")]
    Server --- Photos[("Learners' photo files, in R2")]
    Browser["Learner's browser, on the website's account pages"] -->|"session cookie, then access token"| Server
```

The app's bundled data is the one source: the importers build it, the app bundles it, the service's
image copies it, and the release packages it. Each release's manifest is pinned in
`language-data/releases/`, and checks before merge hold the app's files and the image's copies to
it ([`language-data/README.md`](language-data/README.md), Pinned releases). Each release also
records the JMdict entries it retires, in a file the pipeline writes and the app doesn't bundle,
which the service answers the website's retired word URLs from
([`language-data/retired-entries.md`](language-data/retired-entries.md)). The website reads no data of its own; it asks the
service, which runs the same core the website renders with. The app answers its dictionary
screens with that core too, from a bundle of it checked in beside the data, so it shows what the
website shows with no network ([`docs/agents/ios.md`](docs/agents/ios.md), The dictionary core in the app). A new build of the data is a new
service image; the site redeploys after it only to write the dictionary's sitemaps from it, on the
CI runner (ADR 0016). An app that doesn't bundle the data ships word
cards the core exports, and, signed in, fetches more cards and segmentation from the service's
`/v1/apps` routes with its account's access token ([`language-data/word-cards.md`](language-data/word-cards.md)).

Clients reach both services at one API host, `api.zenbujapanese.com`: nginx sends the account
service's paths to it and the rest to the dictionary service, so they deploy apart
([`docs/agents/api-servers.md`](docs/agents/api-servers.md), The API host). The account service
holds what learners keep across devices, and the one subscription that unlocks syncing it, which
Stripe and the App Store report to it at `/v1/webhooks`. Its Postgres database sits on the same
server, on a network only the service's slots reach, learners' photo files are in R2 (ADR 0020),
and every app keeps its own copy and works offline (ADR 0013), except that the browser extension
saves only with the subscription
([ADR 0022](docs/adr/0022-save-in-the-browser-extension-only-with-the-subscription.md)). The
website's account pages call it from the learner's browser, not from the Worker, whose requests to
the API host Bot Fight Mode challenges
([`docs/agents/web.md`](docs/agents/web.md), Account pages).

The dictionary service's answers are a contract, typed and numbered in the core (`DictionaryContract`,
`dictionaryContract`). The site and the service deploy separately, in either order, so the site
compares the service's number with its own and logs a mismatch rather than refusing it; a test
fails a shape change that doesn't raise the number
([`docs/agents/dictionary-core.md`](docs/agents/dictionary-core.md), Rules).

The app and the website also meet at links: on an iPhone with the app, a dictionary URL opens in
the app (universal links). The app reads the website's URLs with the core's `websitePage`
(`packages/dictionary-core/src/detail/links.ts`), and its Share sends the URLs that file builds
with the website's own URL rules, which the website builds its pages' paths with too. The website's association file and its App Store lookup name the app's bundle ID
(`iosAppBundleId` in `apps/web/src/lib/app-links.ts`), and no check ties that file to the app:
word URLs are permanent (ADR 0007), and
the bundle ID changes only with the app's App Store record (#797 moved it back to
`com.zenbujapanese.dictionary`), when the file changes with it
([`docs/agents/web.md`](docs/agents/web.md), Links that open the app).

## Layers

Imports point one way inside each part, and a lint rule rejects the other direction with a message
saying where the code belongs:

- **The core** imports no runtime or framework: a client passes in its database, files, and
  capabilities ([`packages/dictionary-core/biome.json`](packages/dictionary-core/biome.json)).
- **The account rules** import no runtime, framework, or client either, since they run in Node,
  in a browser, and in JavaScriptCore; only their tests' `src/test/` reads files
  ([`packages/account-rules/biome.json`](packages/account-rules/biome.json)).
- **The word components** (`packages/ui`) import no client, no Next.js, theme switcher, or
  toast, and of the core only its `detail/` and `sources/` modules, and read, keep, and log
  nothing: a client passes text, links, and actions as props. The website's `src/lib` takes
  only their types, and neither service imports them
  ([`docs/agents/ui.md`](docs/agents/ui.md), What the package may import).
- **The browser extension**: only its dictionary worker (`src/worker/`) loads the core's lookup
  code and SQLite, and nothing imports the worker: the offscreen document starts it by its URL,
  and pages, content scripts, and the service worker ask it with a message. The one exception is
  the core's `search/query`, its text checks, which loads no lookup code or SQLite: the
  translation module takes a text's direction from its `writtenLanguage`, as the app does, rather
  than ask the worker or move the function in the core. Pages and content
  scripts draw with `@zenbu/ui`, never the primitives under it, and the service worker, the
  offscreen document, and the worker draw nothing (`apps/extension` in `verify.json`'s
  dependency parts, [`docs/agents/extension.md`](docs/agents/extension.md), Layers).
- **The service**: readers and shared modules, then the worker layer, then HTTP, which reaches the
  dictionary only through the `DictionaryService` interface
  ([`docs/agents/dictionary-api.md`](docs/agents/dictionary-api.md), Code layout).
- **The account service**: the domain; then the database, photo storage, email, sign-in, and the
  payment providers' adapters; then HTTP, which reaches them only through what `src/server.ts`
  and `src/wiring.ts` hand it
  ([`docs/agents/account-api.md`](docs/agents/account-api.md), Code layout).
- **The website**: `src/lib`, then components and hooks, then routes; only
  `src/lib/dictionary/data.ts` reads the service's client, apart from `retired.ts`, which
  `worker.ts` runs before Next.js, and the deploy's sitemap writer, `scripts/write-sitemaps.ts`;
  the browse pages' data asks the client `data.ts` hands it
  ([`docs/agents/web.md`](docs/agents/web.md), Code layout).
- **The app**: only `SearchExperience/Platform/` may use `#if os(...)`, UIKit, AppKit, or an API
  that iPhone, iPad, or the Mac lacks; everything else in the package, its tests, and the app
  target calls its
  adapters (`layers.platforms` in `verify.json`, [`docs/agents/ios.md`](docs/agents/ios.md), iPad
  and Mac). `TranslatorCore`, the Translate tab's engine, imports only Foundation, Observation,
  and OSLog, and can't import the app's `SearchExperience` target;
  the app supplies its speech, translation, and playback clients. `TranslatorOnDevice`, the
  recognizer and translation adapters the Mac's replay check shares, adds only AVFoundation,
  Speech, and Translation ([`docs/agents/translate.md`](docs/agents/translate.md)). Only
  `SearchExperience/Diagnostics/` and `Platform/Diagnostics/` may import Sentry; the rest of the
  app reports through `CrashReporter`
  ([ADR 0018](docs/adr/0018-report-the-apps-crashes-and-freezes-to-sentry.md)), and so do
  problem reports ([ADR 0021](docs/adr/0021-send-problem-reports-through-the-crash-reports-sentry-setup.md)).
- **Across parts**: the app finds and ranks nothing itself: it asks the core, through the bundle
  it runs, what each dictionary screen lists, in what order, and with what labels
  ([`docs/agents/dictionary-core.md`](docs/agents/dictionary-core.md), The app's side), apart
  from a few labels it still writes, such as the kanji element page's Source rows; the app's
  bundle of the core is rebuilt with the core, which
  the core's tests check; the website and the service share their row shapes through the core;
  the account service, the website, and the app hold a learner's account input to the account
  rules, each replaying their case files, and the app runs them from their own bundle;
  no app imports another, and apps reach a shared package by its name.

The website logs through its own `log()`, the Node services through `packages/node-service`'s, and
the core not at all.
