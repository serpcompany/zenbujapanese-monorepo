# The browser extension

`apps/extension` is the Zenbu Japanese extension for Chrome, in Manifest V3. It moves into this
repository to read the shared language data (ADR 0006) and replaces the 1.1.0 prototype, whose
feature contract it follows but none of whose code it copies. Its first version runs in Chrome
only, offline, with no account: nothing signs in. It looks like zenbujapanese.com because it
draws with `@zenbu/ui` ([`ui.md`](ui.md)). It keeps its interface text in `src/shared/labels.ts`,
and a surface's own in its folder's `labels.ts`, such as `src/translate/labels.ts`. What it does
for a learner, and the check for each behavior, is in its
[product docs](../../apps/extension/docs/product/index.md): update them in the same PR as a
behavior change. The terms are in [`CONTEXT.md`](../../CONTEXT.md) (Browser extension, Word
popup, Translation module).

Run every command below from `apps/extension`, after `pnpm install` at the repository root.

## Build and load it

| Command | What it does |
| --- | --- |
| `pnpm build` | The release build, in `dist/`: the manifest, the pages, the service worker, the offscreen document, the dictionary worker, and Geist. No content script yet. Production's hosts, or staging's with `ZENBU_ENVIRONMENT=staging` (below). |
| `pnpm build:test` | The test build, in `dist-test/`: the release build plus the test content script, which runs only on `http://localhost/*` and `http://127.0.0.1/*`. |
| `pnpm test-pages` | Serves the test pages (below) on this checkout's `site` port (`node ../../tools/checks/ports.mjs`), the website's, so the two can't run at once. |
| `pnpm check` | Biome, typecheck, Vitest, and both builds. CI runs it (`Extension`, [`ci.md`](ci.md)). |
| `pnpm test:browser` | The test build, then the Playwright browser tests ([`extension-browser-tests.md`](extension-browser-tests.md)) in Playwright's Chromium. Run `pnpm exec playwright install chromium` once. |
| `pnpm language-data` | The local language-data server on its own, on a free port (or `PORT`); it prints its address. |
| `pnpm --silent agent-chrome <command>` | The agent Chrome harness, in branded Chrome: `verify`, `selftest`, `status`, and the rest ([`README.md`](../../apps/extension/agent-chrome/README.md)). The `verify-extension` skill runs it. |
| `pnpm upload-source-maps [folder]` | Uploads a build's source maps to Sentry and takes them out of the folder ([`extension-error-reports.md`](extension-error-reports.md)). |
| `pnpm package <store\|unpacked> <folder> <zip>` | Zips a build: `store` leaves the manifest's `key` out, `unpacked` keeps it. |
| `pnpm check-package <store\|unpacked> <production\|staging> <zip>` | Fails a zip that isn't that package (below), saying each thing wrong. |

To load a build, open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and pick
`dist/` or `dist-test/`. After a rebuild, press the extension's reload button there. The manifest
asks for Chrome 138 (`minimumChromeVersion` in `build/manifest.ts`), the first with the Translator
API that the extension's translations use (#967); on-device speech recognition (#968) is
outside the first version. It asks for `scripting` so the Translate tab's Use Selection can read
the selected text on the active tab; reaching that tab also needs `activeTab` (#959).

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
| `src/service-worker/` | The service worker. It keeps the offscreen document open (`offscreen-document.ts`) and passes a page's request on to it (`router.ts`), and a translation the same way (`translation.ts`). |
| `src/offscreen/` | The offscreen document, opened with the reason `WORKERS`. It starts the dictionary worker and relays each request to it over a `MessageChannel` of its own (`relay.ts`), and answers translations with Chrome's Translator (`translation.ts`). |
| `src/translation/` | The translation module, which any surface uses: its messages and `translate` (`messages.ts`), a text's direction (`direction.ts`), and the adapter on Chrome's Translator (`translator.ts`), with `downloadTranslator` for a page's click. |
| `src/translate/` | The Translate tab: the box and its buttons, the result card, Use Selection (`selection.ts`), Speak's voice, one on this computer (`speech.ts`), and its labels. |
| `src/worker/` | The dictionary worker, a dedicated module worker. For now it answers a ping (`answer.ts`); #956 gives it the dictionary. |
| `src/content/` | `mountInShadowRoot`, which draws React on a page inside a shadow root. |
| `src/error-reports/` | Sentry for every part, the forwarding of every part's reports to the service worker, the Send Crash Reports setting, and the `beforeSend` that scrubs each event ([`extension-error-reports.md`](extension-error-reports.md)). |
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

### Translation

Any surface translates with `translate(request)` (`src/translation/messages.ts`): it asks how
available the translator is for a direction (`ja` to `en`, or `en` to `ja`), or translates lines
of text. It sends `{ target: 'service-worker', translation }`, and the service worker opens the
offscreen document as for the dictionary and passes it on as
`{ target: 'offscreen', translation }`. The key is `translation`, not `request`, so the
dictionary's listeners never answer it, nor the translation listeners a dictionary request. The offscreen document makes one Translator for
each direction once Chrome says it is `available`, keeps it, and translates each line, leaving a
blank one as it is. It answers `translated`, or `not-available` with Chrome's state, and makes
nothing then; a translation that fails, or doesn't answer within 30 seconds, comes back as
`{ type: 'failed', reason }`, and the offscreen document drops that Translator, destroying it, so
the next one makes a new one. A page's text never goes in an error's message.

Chrome downloads a model only from a click, and the click's activation lasts a few seconds, so a
page asks `translatorAvailability(direction)` itself in that click and, while the model is
`downloadable` or `downloading`, calls `downloadTranslator(direction, onProgress)` at once, before
any message. It reports the download's progress from 0 to 1 and answers the state; a download with
no progress for 60 seconds is stopped and answers Chrome's state then. The page then translates
through the offscreen document, which makes its own Translator once the model is `available`. The
offscreen document
translates with no click once the model is `available`: checked on 2026-10-27 in Chrome 156, in
the headful agent Chrome, by sending a translation from the test content script's world, with no
user gesture, in a Chrome just started. Each direction has its own model. The model is Chrome's,
on this computer, and nothing is sent anywhere to translate.

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
Dialog, and Test error, which throws while drawing so the content script reports it. The release build has no content script; `build/manifest.test.ts` checks that.

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
  `DictionaryStatus` checking, ready, failed, and Check again. Translation, with a stand-in
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
  taken out (`build/upload-source-maps.test.ts`).
- **Browser tests,** with `pnpm test:browser`, in Playwright's Chromium, in CI
  ([`extension-browser-tests.md`](extension-browser-tests.md)).
- **In branded Chrome,** the `verify-extension` skill: the same pages, the offscreen document's
  return, the test content script, and the language-data download, with screenshots in light and
  dark and the log, and the harness's self-test. Proof goes under `tmp/agent/verify/`. On both
  test pages, opening the menu and the dialog, Tabbing through it, and closing it with Esc and with
  a click outside are still checked by hand, and so is Translate: in the side panel, translate a
  Japanese line and an English one. The Translator needs a branded Chrome, headful, since a
  headless one reports the model `downloadable`.
