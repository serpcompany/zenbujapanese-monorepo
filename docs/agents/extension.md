# The browser extension

`apps/extension` is the Zenbu Japanese extension for Chrome, in Manifest V3. It moves into this
repository to read the shared language data (ADR 0006) and replaces the 1.1.0 prototype, whose
feature contract it follows but none of whose code it copies. Its first version runs in Chrome
only, offline, with no account: nothing signs in. It looks like zenbujapanese.com because it
draws with `@zenbu/ui` ([`ui.md`](ui.md)), and it keeps its interface text in
`src/shared/labels.ts`. What it does for a learner, and the check for each behavior, is in its
[product docs](../../apps/extension/docs/product/index.md): update them in the same PR as a
behavior change. The terms are in [`CONTEXT.md`](../../CONTEXT.md) (Browser extension, Word popup, Zenbu
Captions, Video follower).

Run every command below from `apps/extension`, after `pnpm install` at the repository root.

## Build and load it

| Command | What it does |
| --- | --- |
| `pnpm build` | The release build, in `dist/`: the manifest, the pages, the service worker, the offscreen document, the dictionary worker, Geist, and the YouTube content script, which runs only on `https://www.youtube.com/*`. Production's hosts, or staging's with `ZENBU_ENVIRONMENT=staging` (below). |
| `pnpm build:test` | The test build, in `dist-test/`: the release build plus the test content script, which runs only on `http://localhost/*` and `http://127.0.0.1/*`. |
| `pnpm test-pages` | Serves the test pages (below) on this checkout's `site` port (`node ../../tools/checks/ports.mjs`), the website's, so the two can't run at once. |
| `pnpm check` | Biome, typecheck, Vitest, and both builds. CI runs it (`Extension`, [`ci.md`](ci.md)). |
| `pnpm test:browser` | The test build, then the Playwright browser tests ([`extension-browser-tests.md`](extension-browser-tests.md)) in Playwright's Chromium. Run `pnpm exec playwright install chromium` once. |
| `pnpm language-data` | The local language-data server on its own, on a free port (or `PORT`); it prints its address. |
| `pnpm --silent agent-chrome <command>` | The agent Chrome harness, in branded Chrome: `verify`, `selftest`, `status`, and the rest ([`README.md`](../../apps/extension/agent-chrome/README.md)). The `verify-extension` skill runs it. |
| `pnpm upload-source-maps [folder]` | Uploads a build's source maps to Sentry and takes them out of the folder ([Error reports](#error-reports)). |
| `pnpm package <store\|unpacked> <folder> <zip>` | Zips a build: `store` leaves the manifest's `key` out, `unpacked` keeps it. |
| `pnpm check-package <store\|unpacked> <production\|staging> <zip>` | Fails a zip that isn't that package (below), saying each thing wrong. |

To load a build, open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and pick
`dist/` or `dist-test/`. After a rebuild, press the extension's reload button there. The manifest
asks for Chrome 138 (`minimumChromeVersion` in `build/manifest.ts`), the first with the Translator
API that the extension's translations are to use (#967); on-device speech recognition (#968) is
outside the first version.

## Builds and packages

- **The ID.** The manifest's `key` is the Chrome Web Store item's public key, taken from the
  item's published package (`build/key.ts`), so every unpacked build, the test build among them,
  has the store item's ID, `kaalpflpefadijdemimciikalgpgjmok`, on any computer. The store
  refuses a `key` in an upload, so the store package leaves it out.
- **The version** is `apps/extension/package.json`'s, from 2.0.0. The store has 1.1.0, the
  prototype, and refuses an update that isn't above it. Before each upload, raise it; after
  one, set `publishedVersion` in `build/packages.ts` to the uploaded version, in the change that
  records the release, so `pnpm check-package` keeps refusing a version the store would.
- **The hosts.** One build setting, `ZENBU_ENVIRONMENT`, names the website and API hosts
  (`build/hosts.ts`): `production` by default, or `staging` (`staging.zenbujapanese.com` and
  `api-staging.zenbujapanese.com`). The code reads them from `src/shared/hosts.ts`, which the build
  fills in, and the manifest's `homepage_url` is the website. Nothing in `apps/extension` writes
  the website or API host. The core can: `detail/links.ts` writes the website's, and #956's
  language data host is `https://data.zenbujapanese.com`; a bundle that takes the website's from
  the core fails the staging package's check (#958). No API host is in `host_permissions` until
  the extension calls one (#961).
- **The packages.** `Extension packages` ([`ci-deploys.md`](ci-deploys.md)) builds both from
  `main`: the staging package, unpacked with the `key`, for loading by hand, and the store
  package, from the production build, for the owner to upload (#972). Agents never upload to the
  Chrome Web Store. To make either here:

  ```sh
  ZENBU_ENVIRONMENT=staging pnpm build && find dist -name '*.map' -delete
  pnpm package unpacked dist ../../tmp/extension-staging.zip
  pnpm check-package unpacked staging ../../tmp/extension-staging.zip
  ```

  `pnpm check-package` fails a zip whose version isn't `package.json`'s or isn't above 1.1.0, a
  store zip with a `key` or an unpacked one whose `key` gives another ID, a zip missing a page or
  a file the manifest names, one holding the test content script or a source map, and one whose
  `homepage_url` isn't its environment's website or whose files name the other environment's
  hosts, or any `.js` that still holds a `__ZENBU_` setting the build didn't fill in.

## Code layout

| Folder | What it holds |
| --- | --- |
| `src/pages/` | The side panel, the toolbar popup, and the Settings page (the manifest's `options_ui`, opened in a tab). Each is a React page that `mountPage` (`mount-page.tsx`) starts with Geist, the theme, and `.dark` following the system setting. |
| `src/service-worker/` | The service worker. It keeps the offscreen document open (`offscreen-document.ts`) and passes a page's request on to it (`router.ts`). |
| `src/offscreen/` | The offscreen document, opened with the reason `WORKERS`. It starts the dictionary worker and relays each request to it over a `MessageChannel` of its own (`relay.ts`). |
| `src/worker/` | The dictionary worker, a dedicated module worker. For now it answers a ping (`answer.ts`); #956 gives it the dictionary. |
| `src/content/` | `mountInShadowRoot`, which draws React on a page inside a shadow root, and the content scripts' entries (`youtube.ts`). |
| `src/captions/` | A video's captions: the messages and their types (`messages.ts`), YouTube's two requests (`youtube-requests.ts`), the waits after a refusal (`backoff.ts`), and the service worker's side, which fetches, keeps, and announces them (`captions-service.ts`, `serve-captions.ts`). `fixtures/` holds YouTube's answers and a stand-in `fetch` for the tests. |
| `src/video/` | The video follower's interface (`follower.ts`) and its controls (`controls.ts`), YouTube's follower (`youtube-follower.ts`), and the content script's side on a watch page (`youtube-page.ts`). |
| `src/error-reports/` | Sentry for every part, the forwarding of every part's reports to the service worker, the Send Crash Reports setting, and the `beforeSend` that scrubs each event ([Error reports](#error-reports)). |
| `src/shared/` | The messages and their types, the labels, Geist, the colour scheme, and the dictionary status that pages show. |
| `src/styles/` | The pages' stylesheet and the shadow root's, both Tailwind on `@zenbu/ui`'s theme, with `--font-sans` set to Geist. |
| `build/` | The Vite configuration, the manifest, the PostCSS step that makes the shadow root's stylesheet safe on any page, the build setting (`hosts.ts`), the store key (`key.ts`), the package scripts (`packages.ts`, `zip.ts`, and the two commands, `package.ts` and `check-package.ts`), Sentry's settings (`error-reports.ts`), and the source-map upload (`upload-source-maps.ts`). |
| `test-pages/` | Two pages to mount on, the test surface, and the test content script that mounts it. |
| `e2e/` | The Playwright browser tests, their fixtures, what they expect of the build (`expected.ts`), and the local language-data server (`local-server.ts`, `language-data.ts`). |
| `agent-chrome/` | The agent Chrome harness: its daemon and commands, its self-test extension, and the stand-in site it serves under a mapped host. |

### Messages

A page or content script calls `askDictionary(request)`, which sends `{ target: 'service-worker',
request }` with `chrome.runtime.sendMessage`. The service worker opens the offscreen document if
Chrome has closed it (it checks `chrome.runtime.getContexts`, and several requests at once share
one `createDocument`), waits until the new document says it has started (`offscreenStarted`,
which it sends once its listener is in place), then sends `{ target: 'offscreen', request }`.
The offscreen document starts the worker on its first request,
waits for the worker's first message, which says it has loaded, and then posts each request to it
with a port; the worker answers on it. Each listener answers only its own `target`, and every
failure on the way comes back as `{ type: 'failed', reason }`, never as a thrown error or a hang:
a send that throws, an unknown request, a document that doesn't start within 10 seconds, a worker
that fails or doesn't start within 10 seconds (the offscreen document ends it and starts a new
one for the next request), and a worker that doesn't answer within 10 seconds. The service worker keeps nothing between messages but a
document it's waiting on, since Chrome stops it when it's idle.

### Captions and the video

The YouTube content script (`followYouTubePage`) reads the video from the URL at start, on
YouTube's `yt-navigate-finish`, and on `popstate`, and sends `{ type: 'video-opened', videoId }`
through `askCaptions`. A page asks for a tab's captions with `{ type: 'captions', tabId }` and
`{ type: 'try-again', tabId }`. The service worker answers each with a `CaptionsState`, `{ state:
'no-video' }` when the tab's URL (`chrome.tabs.get`, through the host permission) isn't a watch
page, or a Failure, and announces each change of a tab's state as `{ target: 'captions', tabId,
captions }`, to the extension's pages and to that tab. For this the manifest asks for `storage`,
`declarativeNetRequestWithHostAccess`, and `https://www.youtube.com/*`.

- **YouTube's two requests** go from the service worker: the `ANDROID` player request to
  `/youtubei/v1/player`, then the Japanese track's `timedtext`, with `fmt` and `tlang` dropped,
  only on `www.youtube.com`. The core's rules (`captions/youtube.ts`) pick the track and read it.
  A `declarativeNetRequest` session rule (`originRule`) removes `Origin` from the extension's own
  requests to `www.youtube.com/youtubei/`, as the spike (#945) did: POSTs only, from no tab, and
  with the extension as initiator. The service worker adds it before its first request
  (`prepareRequests`); if Chrome refuses it, no request goes, the video fails with "Zenbu couldn't
  get ready to ask YouTube.", and the next request tries again. Whether `initiatorDomains`
  matches the service worker's own requests is for #952's stand-in check, before any request to
  YouTube.
- **A 15-second timeout** (`AbortSignal.timeout`) on each request, so a request YouTube leaves
  unanswered fails as "Zenbu couldn't reach YouTube." and frees the queue for the other tabs.
- **One request at a time.** Every request to YouTube goes through one queue, and each tab's
  requests through its own, so a tab never asks for a video it's already asking for.
- **What it keeps,** in `chrome.storage.session`: each tab's video, its state, and whether the
  Video tab asked (`captions.tab.<id>`), forgotten when the tab closes, and the wait after a 429
  (`captions.rateLimit`), shared by every tab. Chrome stops the service worker when it's idle, so
  nothing lives only in memory but the requests in flight.
- **The waits** (`backoff.ts`): 15, 30, then 60 minutes after each 429 in a row, each up to 20%
  longer at random. The service worker sets no timer: the content script asks again once the
  wait is over, so YouTube is asked only while a watch page is open. It sets its timer only for a
  wait still to come, never for one that is over. Try again asks at once.
- **Zenbu Captions off** (`videos.zenbuCaptions`): `video-opened` answers `loading` and asks
  nothing until a page sends `captions` for that tab. It never hands the content script a wait,
  so that page sets no timer: a tab's stored wait is dropped, and the shared one in
  `captions.rateLimit` still holds for when the captions are asked for. From then on the tab's next videos are
  fetched too. The service worker reads the setting through `settings.ts`, and when Settings
  change with it on, opens each tab's video again (`openVideosAgain`), which asks only for what
  it lacks. The content script never reads settings.

A page drives the video with `{ target: 'video', control }` sent to the tab (`controls.ts`): seek,
play, pause, or a speed. The content script starts the `VideoFollower` on the first one and stops
it when the video changes. The follower (`youtube-follower.ts`) follows `#movie_player`'s
`<video>`: it reports the time frame by frame only while the video plays and someone subscribes,
holds the time and ignores the controls while the player has `ad-showing`, then puts the
learner's speed back, and hides YouTube's own captions with an attribute on the player and one
style rule. `currentLine` (`follower.ts`) finds the line playing at a time, and `playingLine` the
line playing in a `Playback`: none while an ad shows (`ad: true`), whatever the held time. Every
consumer of a follower uses `playingLine`. Netflix's follower
(#966) implements the same interface.

### Drawing on a page

`mountInShadowRoot(content)` adds a `<zenbu-japanese>` element to the page with an open shadow
root, and draws inside it:

- **The page's styles stay out.** `:host { all: initial }` resets what the page set on the host,
  and the surface sets its own font, size, letter spacing, and colour, since a page rule that
  reaches the host element still beats `:host`. `@zenbu/ui`'s theme puts its tokens on
  `:root, :host`.
- **The page's root font size doesn't resize it.** The build turns the shadow root stylesheet's
  rem lengths into pixels, at 16px each (`build/shadow-safe-css.ts`). The pages keep rem.
- **Tailwind's `--tw-*` properties work.** Tailwind v4 registers them with `@property`, which a
  shadow root's stylesheet can't do, and guards its fallback with an `@supports` that Chrome
  fails. The build unwraps that `@supports` in the shadow root's stylesheet, so the fallback
  always applies. A page whose own Tailwind registers the same properties with `@property` is
  one of the test pages.
- **Geist is the page's font, under its own name.** A shadow root can't declare `@font-face`, so
  `addGeist` adds both subsets to `document.fonts` as `Zenbu Geist`, which a page's own Geist
  can't replace. The font files are web accessible to the pages the content script runs on.
- **Menus and dialogs open inside it.** The content goes inside `@zenbu/ui`'s `PortalContainer`,
  set to the surface, so a dialog or menu portals into the shadow root, where its styles are.
- **`.dark` follows the system setting** on the surface, never on the page.

## Test pages

`pnpm test-pages` serves `hostile.html`, whose styles fight the extension (a 10px root font size,
Comic Sans, letter spacing, uppercase, dashed borders on every element, `button { all: unset }`,
and the theme's own token names set to other values), and `tailwind.html`, built with its own
Tailwind v4, which registers the `--tw-*` properties. Load `dist-test/`, open either page, and the
test content script mounts `TestSurface`: a Card with the dictionary status, a DropdownMenu, a
Dialog, and Test error, which throws while drawing so the content script reports it. The release build's only content script is the YouTube one;
`build/manifest.test.ts` checks that.

## Error reports

Every part reports its errors to Sentry's `zenbujapanese-extension` in `serpcompany`, the
extension's own project, set up as the app's is ([`ios-crash-reports.md`](ios-crash-reports.md)),
with one difference below. There are no usage analytics.

- **Owner steps for the project.** Create it, set its DSN as `sentryDsn`, and in **Project
  Settings › Inbound Filters** turn off **Filter out errors known to be caused by browser
  extensions**, leaving the other filters on. A new project has that filter on, and it drops
  every event whose top frame is a `chrome-extension://` URL, which is every event this
  extension sends, so none would arrive and nothing would say why. Then note the project's
  retention, which is set in Sentry, in this section.
- **Which builds send.** The DSN is `sentryDsn` in `build/error-reports.ts`; it only lets a client
  send events, so it isn't a secret. The build puts it, the environment, and the release
  (`zenbujapanese-extension@<manifest version>`) into the code as `import.meta.env.ZENBU_SENTRY_*`.
  The environment follows the app's: `qa`, unless `ZENBU_SENTRY_ENVIRONMENT=production` is set for
  the build, which #986's production package does; its staging package stays `qa`. Tests define
  none of them, so nothing in Vitest reaches Sentry. Until the project exists, `sentryDsn` is
  empty and no build sends anything.
- **Only the service worker talks to Sentry.** It calls `Sentry.init` with global handlers
  (`startSendingErrorReports`), and also sends what the other parts hand it
  (`receiveErrorReport`). The pages (in `mountPage`), the offscreen document, and the dictionary
  worker call `Sentry.init` with global handlers too (`startErrorReports(part, forward)`), but
  their transport sends each envelope to the service worker as an `{ target: 'service-worker',
  errorReport }` message; the worker, which has no `chrome.runtime`, posts it to the offscreen
  document, which passes it on. Each event is tagged `part`: `page`, `service-worker`,
  `offscreen`, or `worker`.
- **Content scripts** (`contentScriptErrorReports(forward)`) run beside the page's own code, so
  they never call `Sentry.init` and add no global handler, as Sentry's
  [guide for browser extensions](https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/)
  says: a `BrowserClient` with its own `Scope` builds an event only from what the content script
  hands it, such as an error React throws while drawing (`mountInShadowRoot`'s `report`, which
  also logs it to the console and never passes it to the page). Its envelope goes to the service
  worker as a message, so the content script makes no request: none shows in the page's Network
  panel, none meets the page's CSP, and Sentry never sees the page's site as an `Origin`.
- **Send Crash Reports.** As in the app ([`crash-reports.md`](../../apps/ios/docs/product/crash-reports.md)),
  reports are on until the learner turns them off. The setting is `crashReports.send` in
  `chrome.storage.local`, a boolean; missing means on (`src/error-reports/report-setting.ts`).
  Since every report goes through the service worker, it is read there, before anything is sent:
  a report made before the read waits for it, and goes only if the setting is on. The service
  worker follows `chrome.storage.onChanged`, so turning it off stops the next report at once and
  turning it on starts them again, with no reload; a setting it can't read counts as off. #959
  draws the switch on the Settings page; until then, set the key from the service worker's
  console. Sentry keeps an event for the project's retention, which is set in Sentry (see the
  owner steps).
- **Handled failures.** When the router answers a dictionary request with a failure, it reports
  it once with `reportFailure(code)`, a message holding only the code and grouped by it:
  `offscreen-document` (the document couldn't be opened), `offscreen-message` (it couldn't be
  reached), or `dictionary-answer` (it answered with a failure, such as a worker that failed or
  didn't answer). Never the failure's text or the request. A code that fails again and again is
  reported once per service-worker life: `dedupeIntegration` drops an event that repeats the one
  before it.
- **What an event holds.** Only the integrations that find a fault run: event filters, function
  names, linked errors, dedupe, the `User-Agent` header, and, outside content scripts, the global
  handlers. Breadcrumbs, sessions, client reports, cookies, query strings, frame variables, and
  context lines are off, and Sentry is asked not to infer an IP address (`userInfo: false`).
  `scrubEvent` (`src/error-reports/scrub.ts`), the `beforeSend`, then drops breadcrumbs, extras,
  the user, the server name, the transaction, and the request's URL, keeps only the `part` tag and
  the `browser`, `os`, `runtime`, `device`, and `trace` contexts, and turns any frame or debug
  image that isn't the extension's own (`chrome-extension://`) into `<page>`. In every message
  and exception value it removes quoted text (`"…"`, `“…”`, `「…」`, `『…』`), URLs, and kana
  and kanji, including kanji outside the BMP such as 𩸽. It can't tell unquoted romaji or English
  from the code's own words, so it leaves them; that's why the code builds a message from codes
  and never puts a learner's text in one.
- **Source maps.** Both builds write hidden source maps (no `sourceMappingURL`) beside their
  scripts. `pnpm upload-source-maps [folder]` (`build/upload-source-maps.ts`, `dist` by default)
  installs a pinned `@sentry/cli` and adds debug IDs to the scripts and maps
  (`sourcemaps inject`), both without the token, then looks for the token and uploads the maps
  under the manifest's release with it, and then always deletes every `.map` from the folder, so
  the store zip, made from the folder afterwards, holds none. The token is `SENTRY_AUTH_TOKEN` or
  the login keychain's `zenbu-sentry-auth-token`, the app's
  ([`ios-crash-reports.md`](ios-crash-reports.md), Debug symbols); the script never prints it.
  No maps, no token, or a step that fails or stalls is a warning and exits 0. Without a token the
  scripts still get their debug IDs, so the package can ship; build the same commit again and
  upload its maps later (the debug IDs come from the files' contents, so they match). #986's
  workflow runs it on each package.
- **Checking one arrives.** In the agent Chrome harness, load a build with the DSN, then throw
  from each context: `setTimeout(() => { throw new Error('Zenbu test error: <part>') })` evaluated
  in a page, the service worker, the offscreen document, and the dictionary worker, and Test
  error on the test surface for the content script. Find each in `zenbujapanese-extension`,
  environment `qa`. Throwing the same way in a test page's own context, with the content script
  running, must send nothing (`--net sentry`), and so must every part once `crashReports.send` is
  `false`.

## Layers

- **Only the dictionary worker opens the dictionary.** Nothing outside `src/worker/` may load the
  core's `artifact/`, `search/`, `embedded/`, or `examples/` modules or SQLite, however indirectly
  (`only-the-worker-opens-the-dictionary`), or import `src/worker/` at all
  (`nothing-imports-the-worker`): the offscreen document starts the worker by its URL.
- **Pages and content scripts draw with `@zenbu/ui`,** never the Base UI or Radix primitives under
  it (`extension-draws-with-zenbu-ui`). Add what's missing to `@zenbu/ui`.
- **The service worker, the offscreen document, and the worker draw nothing:** nothing they
  import reaches React or `@zenbu/ui` (`extension-background-draws-nothing`).
- **No other app,** and shared packages by their names (`extension-never-imports-another-app`,
  `core-by-package-name`).

`pnpm verify` holds these (`apps/extension` in `verify.json`'s dependency parts), and Biome
(`apps/extension/biome.json`, `noRestrictedImports`) says the same while editing.

## Checks

- **Unit and DOM tests,** with `pnpm test`: the manifest of each build, with the store item's ID
  from its `key`, `package.json`'s version, and its environment's website; each environment's
  hosts in a bundle built with them, and not the other's; each package and each way
  `pnpm check-package` fails one; the zips, which the system's `unzip` opens; the rem conversion and
  the `@supports` unwrapping; the shadow root's stylesheet as the build makes it, with no rem and
  the `--tw-*` fallback outside any `@supports`, and the pages' with rem kept; the offscreen
  document opened once and again after Chrome closes it, once it says it has started; a ping from
  a page through the service worker and the offscreen document to the worker and back, also on
  the first ask after the document closed, and each failure; the relay waiting for the worker to
  load, starting a new one after a failure, and its time limit; and, in happy-dom,
  `mountInShadowRoot` drawing the test surface, Geist's family, `.dark`, a dialog portalled into
  the shadow root, an error in its content handed to its reporter, and unmounting, and
  `DictionaryStatus` checking, ready, failed, and Check again. Error reports: `scrub.test.ts`
  (page text, a page URL, and a selected word gone from every part of an event), the content
  script's client sending its own error but never the page's, with no global handler, the pages'
  and a worker's uncaught errors sent with their part, all through a recording transport
  (`src/test/recording-settings.ts`), and the upload script's steps, token, warnings, and the maps
  taken out (`build/upload-source-maps.test.ts`).
- **Captions and the video,** with YouTube's answers from `src/captions/fixtures/` through a
  stand-in `fetch`, never the network: the two requests and the core's rules, No Japanese
  Captions, each failure, and a track on another host refused (`youtube-requests.test.ts`); one
  request per video, kept for the session, the waits after a 429 on a fake clock, Try again, and
  Zenbu Captions off (`captions-service.test.ts`); and, in happy-dom, a watch page asking once per
  video and nothing for seeking, line moves, Repeat, or speed, and asking again only once the wait
  is over (`youtube-page.interaction.test.tsx`), and the follower's controls, ads, the learner's
  speed, and hiding YouTube's captions (`youtube-follower.interaction.test.tsx`).
- **Browser tests,** with `pnpm test:browser`, in Playwright's Chromium, in CI
  ([`extension-browser-tests.md`](extension-browser-tests.md)).
- **In branded Chrome,** the `verify-extension` skill: the same pages, the offscreen document's
  return, the test content script, and the language-data download, with screenshots in light and
  dark and the log, and the harness's self-test. Proof goes under `tmp/agent/verify/`. On both
  test pages, opening the menu and the dialog, Tabbing through it, and closing it with Esc and with
  a click outside are still checked by hand.
