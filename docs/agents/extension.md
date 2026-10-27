# The browser extension

`apps/extension` is the Zenbu Japanese extension for Chrome, in Manifest V3. It moves into this
repository to read the shared language data (ADR 0006) and replaces the 1.1.0 prototype, whose
feature contract it follows but none of whose code it copies. Its first version runs in Chrome
only, offline, with no account: nothing signs in. It looks like zenbujapanese.com because it
draws with `@zenbu/ui` ([`ui.md`](ui.md)), and it keeps its interface text in
`src/shared/labels.ts`, and the side panel's in `src/side-panel/labels.ts`. What it does for a
learner, and the check for each behavior, is in its
[product docs](../../apps/extension/docs/product/index.md): update them in the same PR as a
behavior change. The terms are in [`CONTEXT.md`](../../CONTEXT.md) (Browser extension, Side
panel, Word popup).

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
API that the extension's translations are to use (#967); on-device speech recognition (#968) is
outside the first version. The Store listing, its ID, and the version and builds that ship are
#986's.

## Code layout

| Folder | What it holds |
| --- | --- |
| `src/pages/` | The side panel, the toolbar popup, and the Settings page (the manifest's `options_ui`, opened in a tab). Each is a React page that `mountPage` (`mount-page.tsx`) starts with Geist, the theme, and `.dark` following the system setting. |
| `src/service-worker/` | The service worker. It keeps the offscreen document open (`offscreen-document.ts`), passes a page's request on to it (`router.ts`), and opens the side panel on a route (`side-panel.ts`). |
| `src/side-panel/` | The side panel: the header, the tab bar, and each tab's stack of pages (`panel.tsx`), the tabs (`tabs.tsx`) and pages (`pages.tsx`) it draws, routes and `openPanel` (`route.ts`), and its text (`labels.ts`). |
| `src/offscreen/` | The offscreen document, opened with the reason `WORKERS`. It starts the dictionary worker and relays each request to it over a `MessageChannel` of its own (`relay.ts`). |
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

### The side panel

The panel draws its header, the tab bar, and the Back row over a page; a tab or a page draws only
its content. A tab is a line in `tabs` (`src/side-panel/tabs.tsx`): its id, label, icon, and
`Content`, which gets `open(page)`. A page is a kind in `PanelPage` (`route.ts`) and a line in
`pages` (`pages.tsx`). Each tab keeps its own stack of pages (`navigation.ts`), and Back pops one.

- **`openPanel(route)` opens it, from a click.** An extension page, the popup, or a content
  script calls it in the click handler itself, before any `await`. Chrome opens a side panel only
  in response to a user gesture, and the gesture lasts through one message only if the service
  worker calls `chrome.sidePanel.open` before it awaits anything: checked in Chrome 156 on
  2026-10-28 from a content script, an extension page in a tab, and the popup, and refused after
  awaiting `chrome.storage`, `chrome.windows.getLastFocused`, or a timer. So the service worker
  (`src/service-worker/side-panel.ts`) calls `open` first, on the sender tab's window or, from
  the popup, the current one. Then it saves the route in `chrome.storage.session` under
  `sidePanel.route.<windowId>` and sends `{ target: 'side-panel', windowId, route }`.
- **The panel takes a route once.** An open panel takes the message; one still loading reads the
  key. It listens before it reads, and removes the key when it takes a route. Opening an open
  panel doesn't reload it. When Chrome refuses to open the panel, the service worker removes the
  key and answers `{ type: 'failed', reason }`.
- **The last tab** is `sidePanel.lastTab` in `chrome.storage.local` (the manifest asks for
  `storage`), `video` until a tab is chosen. Nothing syncs.
- **The test page** (`{ page: 'test' }`) is the test build's: `isPanelRoute` refuses it unless
  `import.meta.env.MODE` is `test`, as it is in Vitest and `pnpm build:test`.
- **Before the dictionary is ready,** while `useDataState()` says it is checking, downloading, or
  failed, the panel draws `DictionaryProgress` (`src/shared/dictionary-progress.tsx`) instead of
  the tabs.

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

- **Unit and DOM tests,** with `pnpm test`: the manifest of each build; the rem conversion and
  the `@supports` unwrapping; the shadow root's stylesheet as the build makes it, with no rem and
  the `--tw-*` fallback outside any `@supports`, and the pages' with rem kept; the offscreen
  document opened once and again after Chrome closes it, once it says it has started; a ping from
  a page through the service worker and the offscreen document to the worker and back, also on
  the first ask after the document closed, and each failure; the relay waiting for the worker to
  load, starting a new one after a failure, and its time limit; and, in happy-dom,
  `mountInShadowRoot` drawing the test surface, Geist's family, `.dark`, a dialog portalled into
  the shadow root, and unmounting, and `DictionaryStatus` checking, ready, failed, and Check
  again. For the side panel: routes and tab stacks; the service worker calling `open` before it
  awaits anything, handing the route over, and leaving none when Chrome refuses; and, in
  happy-dom, the five tabs and their empty states, the arrow keys, pages over a tab and Back, the
  last tab, the sign-up links, the dictionary progress, and `openPanel` through a fake Chrome to
  the panel, closed and open.
- **In Chrome,** by hand or by an agent: load `dist-test/`, open the side panel, the popup, and
  Settings in light and dark, see "The dictionary is ready." from the test surface, close the
  offscreen document from `chrome://extensions` (Inspect views) and check again, and on both
  test pages open the menu and the dialog, Tab through it, and close it with Esc and with a click
  outside. Open the side panel with `openPanel` from a click, closed and open, and check that
  nothing scrolls sideways at 320 px. Check it in the side panel itself: in a background tab,
  `side-panel.html` waits for the tab to come to the front before it hides the tab it left.
  Until #952 moves it into the repository, agents use the agent
  Chrome harness in the main checkout's `tmp/agent/agent-chrome`, whose daemon must resume the
  targets it attaches to, or the dictionary worker stays paused and every request fails after
  10 seconds (#1057). Proof goes under
  `tmp/agent/verify/`.
