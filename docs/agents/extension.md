# The browser extension

`apps/extension` is the Zenbu Japanese extension for Chrome, in Manifest V3. It moves into this
repository to read the shared language data (ADR 0006) and replaces the 1.1.0 prototype, whose
feature contract it follows but none of whose code it copies. Its first version runs in Chrome
only, offline, with no account: nothing signs in. It looks like zenbujapanese.com because it
draws with `@zenbu/ui` ([`ui.md`](ui.md)). It keeps its interface text in `src/shared/labels.ts`,
and a surface's own in its folder's `labels.ts`, such as `src/side-panel/labels.ts` and
`src/translate/labels.ts`. What it does for a learner, and the check for each behavior, is in its
[product docs](../../apps/extension/docs/product/index.md): update them in the same PR as a
behavior change. The terms are in [`CONTEXT.md`](../../CONTEXT.md) (Browser extension, Side
panel, Word popup, Zenbu Captions, Video follower, Translation module). How the dictionary worker
downloads the language data, keeps it current, and answers from it is in
[`extension-language-data.md`](extension-language-data.md).

Run every command below from `apps/extension`, after `pnpm install` at the repository root.

## Build and load it

| Command | What it does |
| --- | --- |
| `pnpm build` | The release build, in `dist/`: the manifest, the pages, the service worker, the offscreen document, the dictionary worker with `sqlite3.wasm`, Geist, and the YouTube content script, which runs only on `https://www.youtube.com/*`. Production's hosts, or staging's with `ZENBU_ENVIRONMENT=staging` (below). |
| `pnpm build:test` | The test build, in `dist-test/`: the release build plus the test content script, which runs only on `http://localhost/*` and `http://127.0.0.1/*`. |
| `pnpm test-pages` | Serves the test pages (below) on this checkout's `site` port (`node ../../tools/checks/ports.mjs`), the website's, so the two can't run at once. |
| `pnpm check` | Biome, typecheck, Vitest, and both builds. CI runs it (`Extension`, [`ci.md`](ci.md)). |
| `pnpm test:browser` | The test build, then the Playwright browser tests ([`extension-browser-tests.md`](extension-browser-tests.md)) in Playwright's Chromium. Run `pnpm exec playwright install chromium` once. |
| `pnpm language-data` | The local language-data server, on a free port (or `PORT`); it prints its address. |
| `pnpm --silent agent-chrome <command>` | The agent Chrome harness, in branded Chrome: `verify`, `selftest`, `status`, and the rest ([`README.md`](../../apps/extension/agent-chrome/README.md)). The `verify-extension` skill runs it. |
| `pnpm upload-source-maps [folder]` | Uploads a build's source maps to Sentry and takes them out of the folder ([`extension-error-reports.md`](extension-error-reports.md)). `Extension packages` runs it on the Chrome Web Store package's build, only on `main`; the staging package's maps aren't uploaded ([`ci-deploys.md`](ci-deploys.md)). |
| `pnpm package <store\|unpacked> <folder> <zip>` | Zips a build: `store` leaves the manifest's `key` out, `unpacked` keeps it. |
| `pnpm check-package <store\|unpacked> <production\|staging> <zip>` | Fails a zip that isn't that package (below), saying each thing wrong. |

To load a build, open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and pick
`dist/` or `dist-test/`. After a rebuild, press the extension's reload button there. The manifest
asks for Chrome 138 (`minimumChromeVersion` in `build/manifest.ts`), the first with the Translator
API that the extension's translations use (#967); on-device speech recognition (#968) is
outside the first version. It asks for `scripting` to register the page script for the sites
Zenbu holds ([`extension-page-lookup.md`](extension-page-lookup.md)), and so that Use Selection
can read the selected text on a tab with no page script, which `activeTab` reaches after a click
on the toolbar icon.

## Builds and packages

- **The ID.** The manifest's `key` is the Chrome Web Store item's public key, taken from the
  item's published package (`build/key.ts`), so every unpacked build, the test build among them,
  has the store item's ID, `kaalpflpefadijdemimciikalgpgjmok`, on any computer. The store
  refuses a `key` in an upload, so the store package leaves it out.
- **The version** is `apps/extension/package.json`'s, from 2.0.0. The store has 1.1.0, the
  prototype, and refuses an update that isn't above it. Before each upload, raise it; after
  one, set `publishedVersion` in `build/packages.ts` to the uploaded version, in the change that
  records the release, so `pnpm check-package` keeps refusing a version the store would.
- **The hosts.** One build setting, `ZENBU_ENVIRONMENT`, names the website's host
  (`build/hosts.ts`): `production` by default, or `staging` (`staging.zenbujapanese.com`). The
  code reads it from `src/shared/hosts.ts`, which the build fills in, and the manifest's
  `homepage_url` is the website. Nothing in `apps/extension` writes the website's host. The core can: `detail/links.ts` writes the website's, and #956's
  language data host is `https://data.zenbujapanese.com`, or the test build's
  `http://language-data.localhost`, which fails a package's check, as does a bundle that takes
  the website's host from the core in staging (#958). The extension names no API host, in
  its build or its `host_permissions`, until it calls one (#961).
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
| `src/pages/` | The side panel, the Settings page (the manifest's `options_ui`, opened in a tab), and the welcome tab; there is no toolbar popup. Each is a React page that `mountPage` (`mount-page.tsx`) starts with Geist, the theme, and `.dark` following the system setting. |
| `src/service-worker/` | The service worker. It keeps the offscreen document open (`offscreen-document.ts`), passes a page's request on to it (`router.ts`), and a translation the same way (`translation.ts`), passes on the settings (`settings.ts`), opens the side panel on a route (`side-panel.ts`), and opens the welcome tab on install and asks for updates (`language-data-updates.ts`). |
| `src/side-panel/` | The side panel: the header, the tab bar, and each tab's stack of pages (`panel.tsx`), the tabs (`tabs.tsx`) and pages (`pages.tsx`) it draws, the header's controls (`header-controls.tsx`, `active-site.ts`), routes and `openPanel` (`route.ts`), and its text (`labels.ts`). |
| `src/offscreen/` | The offscreen document, opened with the reason `WORKERS`. It starts the dictionary worker and relays each request to it over a `MessageChannel` of its own (`relay.ts`), and answers translations with Chrome's Translator (`translation.ts`). |
| `src/translation/` | The translation module, which any surface uses: its messages and `translate` (`messages.ts`), a text's direction (`direction.ts`), and the adapter on Chrome's Translator (`translator.ts`), with `downloadTranslator` for a page's click. |
| `src/translate/` | The Translate tab: the box and its buttons, the result card, the Japanese source's words (`source-words.tsx`), Use Selection (`selection.ts`), which asks the page script first, Speak's voice, the best on this computer (`speech.ts`), and its labels. |
| `src/page-lookup/` | Page lookup, which the page script runs: finding the text, segmenting it, the underlines, the reading aids, and the click ([`extension-page-lookup.md`](extension-page-lookup.md)). |
| `src/word-popup/` | The word popup, its card and choice, the host that mounts it on a page in a shadow root, and the settings a content script gives that host (`popup-settings.ts`). |
| `src/worker/` | The dictionary worker, a dedicated module worker: it downloads the language data, opens it in sqlite-wasm, and answers from the core (`answer.ts`; [`extension-language-data.md`](extension-language-data.md)). |
| `src/content/` | `mountInShadowRoot`, which draws React on a page inside a shadow root, and the content scripts' entries (`youtube.ts`, and `page-lookup.ts`, the page script). |
| `src/captions/` | A video's captions: the messages and their types (`messages.ts`), YouTube's two requests (`youtube-requests.ts`), the waits after a refusal (`backoff.ts`), and the service worker's side, which fetches, keeps, and announces them (`captions-service.ts`, `serve-captions.ts`). `fixtures/` holds YouTube's answers and a stand-in `fetch` for the tests. |
| `src/video/` | The video follower's interface (`follower.ts`) and its controls (`controls.ts`), YouTube's follower (`youtube-follower.ts`), the content script's side on a watch page (`youtube-page.ts`), the Video tab's port (`video-tab-port.ts`), and the pause while a word popup is open (`popup-pause.ts`). |
| `src/player-captions/` | The caption on the player and its line controls ([`extension-captions.md`](extension-captions.md#the-caption-on-the-player)). |
| `src/video-tab/` | The side panel's Video tab, a video's transcript ([`extension-side-panel.md`](extension-side-panel.md)). |
| `src/error-reports/` | Sentry for every part, the forwarding of every part's reports to the service worker, the Send Crash Reports setting, and the `beforeSend` that scrubs each event ([`extension-error-reports.md`](extension-error-reports.md)). |
| `src/settings/` | Settings and its pages ([`extension-settings.md`](extension-settings.md)). |
| `src/shared/` | The messages and their types, the settings, the labels, Geist, the colour scheme, the language data's host and state, and what pages show of them: the dictionary status, the welcome tab, and the dictionary's progress every page that shows the download draws (`dictionary-progress.tsx`). Pages and content scripts look words up with `dictionary.ts`'s helpers, never raw requests. |
| `src/styles/` | The pages' stylesheet and the shadow root's, both Tailwind on `@zenbu/ui`'s theme, with `--font-sans` set to Geist, and both with the reading aids' rules, since a content script imports no CSS. |
| `src/test/` | Test-only helpers: a release in the bucket's layout (`publish-release.ts`), fakes of the language-data bucket, file storage, and database pool (`fake-language-data.ts`), error reports' recording transport, the Video tab's stand-ins (`video-tab-harness.tsx`), and the caption's stand-in clock for a video (`clock-follower.ts`) and player (`player-on.tsx`). Layers treat it as tests. |
| `build/` | The Vite configuration, the manifest, the PostCSS step that makes the shadow root's stylesheet safe on any page, the build setting (`hosts.ts`), the store key (`key.ts`), the package scripts (`packages.ts`, `zip.ts`, and the two commands, `package.ts` and `check-package.ts`), Sentry's settings (`error-reports.ts`), and the source-map upload (`upload-source-maps.ts`). |
| `test-pages/` | Two pages to mount on, the test surface, the test content script that mounts it and shows each reading aid's state (`settings-follower.tsx`), and the words page page lookup's browser tests read (`words.html`). |
| `e2e/` | The Playwright browser tests, their fixtures, what they expect of the build (`expected.ts`), the local data server and its release (`local-server.ts`, `fixture-release.ts`), and the agent Chrome harness's stand-in site under `www.youtube.com` (`youtube-stand-in.ts`). |
| `agent-chrome/` | The agent Chrome harness: its daemon and commands, its self-test extension, and the stand-in site it serves under a mapped host. |

### Messages

A page or content script calls `askDictionary(request)`, which sends `{ target: 'service-worker',
request }` with `chrome.runtime.sendMessage`. The service worker opens the offscreen document if
Chrome has closed it (it checks `chrome.runtime.getContexts`, and several requests at once share one
`createDocument`), waits until the new document says it has started (`offscreenStarted`, which it
sends once its listener is in place), then sends `{ target: 'offscreen', request }`. The offscreen
document starts the worker on its first request, waits for the worker's first message, which says it
has loaded, and then posts each request to it with a port; the worker answers on it. Each listener
answers only its own `target`, and every failure on the way comes back as `{ type: 'failed', reason
}`, never as a thrown error or a hang: a send that throws, an unknown request, a document that
doesn't start within 10 seconds, a worker that fails or doesn't start within 10 seconds (the
offscreen document ends it and starts a new one for the next request), and a worker that doesn't
answer within 10 seconds. The service worker keeps nothing between messages but a document it's
waiting on, since Chrome stops it when it's idle.

### Captions and the video

How the service worker gets a YouTube video's captions and the content script follows the video
is in [`extension-captions.md`](extension-captions.md).

### Translation

How any surface translates through the offscreen document, and how a page downloads Chrome's
model from a click, is in [`extension-translation.md`](extension-translation.md).

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
  can't replace. The fonts are inlined in the bundle and added from their bytes, so no page
  loads an extension file and the manifest has no `web_accessible_resources`: on real YouTube,
  Chrome refused the page's load of the fonts' web-accessible URL (#1070).
- **Menus and dialogs open inside it.** The content goes inside `@zenbu/ui`'s `PortalContainer`,
  set to the surface, so a dialog or menu portals into the shadow root, where its styles are.
- **`.dark` follows the system setting** on the surface, never on the page.

### The side panel

How the panel is built, opened, and checked is in [`extension-side-panel.md`](extension-side-panel.md).

### Page lookup

How the page script is registered for the sites Zenbu holds, underlines words, and opens the word
popup is in [`extension-page-lookup.md`](extension-page-lookup.md).

## Test pages

`pnpm test-pages` serves `hostile.html`, whose styles fight the extension (a 10px root font size,
Comic Sans, letter spacing, uppercase, dashed borders on every element, `button { all: unset }`,
and the theme's own token names set to other values), and `tailwind.html`, built with its own
Tailwind v4, which registers the `--tw-*` properties. Load `dist-test/`, open either page, and the
test content script mounts `TestSurface`: a Card with the dictionary status, a DropdownMenu, a
Dialog, and Test error, which throws while drawing so the content script reports it. The release
build declares only the YouTube content script, and registers the page script at run time;
`build/manifest.test.ts` checks that. How each part reports its errors is in
[`extension-error-reports.md`](extension-error-reports.md).

## Layers

- **Only the dictionary worker opens the dictionary.** Nothing outside `src/worker/` may load the
  core's `artifact/`, `search/`, `embedded/`, or `examples/` modules or SQLite, however indirectly
  (`only-the-worker-opens-the-dictionary`), or import `src/worker/` at all
  (`nothing-imports-the-worker`): the offscreen document starts the worker by its URL. The one
  exception is `search/query`, the core's text checks, which loads none of them: the translation
  module takes a text's direction from its `writtenLanguage`, as the app does.
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
  `DictionaryStatus` drawing the data's state, never ready while it downloads or failed, and Check
  again, and the welcome tab's progress, ready, updating, failed, and Try again; the lookup helpers;
  the language data's download, resume, checks, and updates. Translation, with a stand-in
  Translator on `globalThis.Translator`: a text's direction, with the app's `WrittenLanguageTests`
  cases; a line from a content script through the service worker and the offscreen document and
  back, each way, its availability, one Translator for each direction, `not-available` with nothing
  made, each failure, and the listeners kept apart from the dictionary's, a Translator dropped after
  a failure or a timeout; `downloadTranslator`'s progress and its limit on a stalled download; Use
  Selection's reading; Speak's voice, only one on this computer; and, in happy-dom, the Translate
  tab: its fit to the panel's tab props, Use Selection, both directions, Copy, Speak and Speak with
  no local voice, the download started before any message and its progress then the result, the
  notices, Clear, an emptied box, and a late answer dropped. Error reports: `scrub.test.ts` (page
  text, a page URL, and a selected word gone from every part of an event), the content script's
  client sending its own error but never the page's, with no global handler, the pages' and a
  worker's uncaught errors sent with their part, all through a recording transport
  (`src/test/recording-settings.ts`), and the upload script's steps, token, warnings, and the maps
  taken out (`build/upload-source-maps.test.ts`). The side panel's are in
  [`extension-side-panel.md`](extension-side-panel.md).
- **Captions and the video,** and the caption on the player: in
  [`extension-captions.md`](extension-captions.md#checks).
- **Browser tests,** with `pnpm test:browser`, in Playwright's Chromium, in CI
  ([`extension-browser-tests.md`](extension-browser-tests.md)).
- **In branded Chrome,** the `verify-extension` skill: the same pages, the offscreen document's
  return, the test content script, and the language-data download, with screenshots in light and
  dark and the log, and the harness's self-test. Proof goes under `tmp/agent/verify/`. On both
  test pages, opening the menu and the dialog, Tabbing through it, and closing it with Esc and with
  a click outside are still checked by hand, and so is Translate: in the side panel, translate a
  Japanese line and an English one. The Translator needs a branded Chrome, headful, since a
  headless one reports the model `downloadable`.
