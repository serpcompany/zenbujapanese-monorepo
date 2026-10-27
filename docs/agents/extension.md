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
| `pnpm build` | The release build, in `dist/`: the manifest, the pages, the service worker, the offscreen document, the dictionary worker, and Geist. No content script yet. |
| `pnpm build:test` | The test build, in `dist-test/`: the release build plus the test content script, which runs only on `http://localhost/*` and `http://127.0.0.1/*`. |
| `pnpm test-pages` | Serves the test pages (below) on this checkout's `site` port (`node ../../tools/checks/ports.mjs`), the website's, so the two can't run at once. |
| `pnpm check` | Biome, typecheck, Vitest, and both builds. CI runs it (`Extension`, [`ci.md`](ci.md)). |

To load a build, open `chrome://extensions`, turn on Developer mode, choose Load unpacked, and pick
`dist/` or `dist-test/`. After a rebuild, press the extension's reload button there. The manifest
asks for Chrome 138 (`minimumChromeVersion` in `build/manifest.ts`), the first with the Translator
API that the extension's translations use (#967); on-device speech recognition (#968) is
outside the first version. It asks for `scripting` so the Translate tab's Use Selection can read
the selected text on the active tab; reaching that tab also needs `activeTab` (#959). The Store
listing, its ID, and the version and builds that ship are #986's.

## Code layout

| Folder | What it holds |
| --- | --- |
| `src/pages/` | The side panel, the toolbar popup, and the Settings page (the manifest's `options_ui`, opened in a tab). Each is a React page that `mountPage` (`mount-page.tsx`) starts with Geist, the theme, and `.dark` following the system setting. |
| `src/service-worker/` | The service worker. It keeps the offscreen document open (`offscreen-document.ts`) and passes a page's request on to it (`router.ts`), and a translation the same way (`translation.ts`). |
| `src/offscreen/` | The offscreen document, opened with the reason `WORKERS`. It starts the dictionary worker and relays each request to it over a `MessageChannel` of its own (`relay.ts`), and answers translations with Chrome's Translator (`translation.ts`). |
| `src/translation/` | The translation module, which any surface uses: its messages and `translate` (`messages.ts`), a text's direction (`direction.ts`), and the adapter on Chrome's Translator (`translator.ts`), with `downloadTranslator` for a page's click. |
| `src/translate/` | The Translate tab: the box and its buttons, the result card, Use Selection (`selection.ts`), and its labels. |
| `src/worker/` | The dictionary worker, a dedicated module worker. For now it answers a ping (`answer.ts`); #956 gives it the dictionary. |
| `src/content/` | `mountInShadowRoot`, which draws React on a page inside a shadow root. |
| `src/shared/` | The messages and their types, the labels, Geist, the colour scheme, and the dictionary status that pages show. |
| `src/styles/` | The pages' stylesheet and the shadow root's, both Tailwind on `@zenbu/ui`'s theme, with `--font-sans` set to Geist. |
| `build/` | The Vite configuration, the manifest, and the PostCSS step that makes the shadow root's stylesheet safe on any page. |
| `test-pages/` | Two pages to mount on, the test surface, and the test content script that mounts it. |

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
`{ type: 'failed', reason }`, and the next one makes a new Translator. A page's text never goes
in an error's message.

Chrome downloads a model only from a click, so a page calls `downloadTranslator(direction,
onProgress)` in that click, which reports the download's progress from 0 to 1 and answers the
state, and then translates again through the offscreen document. The offscreen document
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
test content script mounts `TestSurface`: a Card with the dictionary status, a DropdownMenu, and
a Dialog. The release build has no content script; `build/manifest.test.ts` checks that.

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

- **Unit and DOM tests,** with `pnpm test`: the manifest of each build; the rem conversion and
  the `@supports` unwrapping; the shadow root's stylesheet as the build makes it, with no rem and
  the `--tw-*` fallback outside any `@supports`, and the pages' with rem kept; the offscreen
  document opened once and again after Chrome closes it, once it says it has started; a ping from
  a page through the service worker and the offscreen document to the worker and back, also on
  the first ask after the document closed, and each failure; the relay waiting for the worker to
  load, starting a new one after a failure, and its time limit; and, in happy-dom,
  `mountInShadowRoot` drawing the test surface, Geist's family, `.dark`, a dialog portalled into
  the shadow root, and unmounting, and `DictionaryStatus` checking, ready, failed, and Check
  again. Translation, with a stand-in Translator on `globalThis.Translator`: a text's direction,
  with the app's `WrittenLanguageTests` cases; a line from a content script through the service
  worker and the offscreen document and back, each way, its availability, one Translator for
  each direction, `not-available` with nothing made, each failure, and the listeners kept apart
  from the dictionary's; `downloadTranslator`'s progress; Use Selection's reading; and, in
  happy-dom, the Translate tab: Use Selection, both directions, Copy, Speak, the download's
  progress then the result, the notices, Clear, an emptied box, and a late answer dropped.
- **In Chrome,** by hand or by an agent: load `dist-test/`, open the side panel, the popup, and
  Settings in light and dark, see "The dictionary is ready." from the side panel and the test
  surface, close the offscreen document from `chrome://extensions` (Inspect views) and check
  again, and on both test pages open the menu and the dialog, Tab through it, and close it with
  Esc and with a click outside. In the side panel, translate a Japanese line and an English
  one; the Translator needs a branded Chrome, headful, since a headless one reports the model
  `downloadable`. Until #952 moves it into the repository, agents use the agent
  Chrome harness in the main checkout's `tmp/agent/agent-chrome`, whose daemon must resume the
  targets it attaches to, or the dictionary worker stays paused and every request fails after
  10 seconds (#1057). Proof goes under
  `tmp/agent/verify/`.
