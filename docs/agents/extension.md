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
| `pnpm build` | The release build, in `dist/`: the manifest, the pages, the service worker, the offscreen document, the dictionary worker, Geist, and the YouTube content script, which runs only on `https://www.youtube.com/*`. |
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
| `src/service-worker/` | The service worker. It keeps the offscreen document open (`offscreen-document.ts`) and passes a page's request on to it (`router.ts`). |
| `src/offscreen/` | The offscreen document, opened with the reason `WORKERS`. It starts the dictionary worker and relays each request to it over a `MessageChannel` of its own (`relay.ts`). |
| `src/worker/` | The dictionary worker, a dedicated module worker. For now it answers a ping (`answer.ts`); #956 gives it the dictionary. |
| `src/content/` | `mountInShadowRoot`, which draws React on a page inside a shadow root, and the content scripts' entries (`youtube.ts`). |
| `src/captions/` | A video's captions: the messages and their types (`messages.ts`), YouTube's two requests (`youtube-requests.ts`), the waits after a refusal (`backoff.ts`), and the service worker's side, which fetches, keeps, and announces them (`captions-service.ts`, `serve-captions.ts`). `fixtures/` holds YouTube's answers and a stand-in `fetch` for the tests. |
| `src/video/` | The video follower's interface (`follower.ts`) and its controls (`controls.ts`), YouTube's follower (`youtube-follower.ts`), and the content script's side on a watch page (`youtube-page.ts`). |
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
  requests to `www.youtube.com/youtubei/`, as the spike (#945) did.
- **One request at a time.** Every request to YouTube goes through one queue, and each tab's
  requests through its own, so a tab never asks for a video it's already asking for.
- **What it keeps,** in `chrome.storage.session`: each tab's video, its state, and whether the
  Video tab asked (`captions.tab.<id>`), forgotten when the tab closes, and the wait after a 429
  (`captions.rateLimit`), shared by every tab. Chrome stops the service worker when it's idle, so
  nothing lives only in memory but the requests in flight.
- **The waits** (`backoff.ts`): 15, 30, then 60 minutes after each 429 in a row, each up to 20%
  longer at random. The service worker sets no timer: the content script asks again once the
  wait is over, so YouTube is asked only while a watch page is open. Try again asks at once.
- **Zenbu Captions off** (`videos.zenbuCaptions`): `video-opened` answers `loading` and asks
  nothing until a page sends `captions` for that tab. From then on the tab's next videos are
  fetched too. The service worker reads the setting through `settings.ts`, and when Settings
  change with it on, opens each tab's video again (`openVideosAgain`), which asks only for what
  it lacks. The content script never reads settings.

A page drives the video with `{ target: 'video', control }` sent to the tab (`controls.ts`): seek,
play, pause, or a speed. The content script starts the `VideoFollower` on the first one and stops
it when the video changes. The follower (`youtube-follower.ts`) follows `#movie_player`'s
`<video>`: it reports the time frame by frame only while the video plays and someone subscribes,
holds the time and ignores the controls while the player has `ad-showing`, then puts the
learner's speed back, and hides YouTube's own captions with an attribute on the player and one
style rule. `currentLine` (`follower.ts`) finds the line playing at a time. Netflix's follower
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
test content script mounts `TestSurface`: a Card with the dictionary status, a DropdownMenu, and
a Dialog. The release build's only content script is the YouTube one; `build/manifest.test.ts`
checks that.

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
  again.
- **Captions and the video,** with YouTube's answers from `src/captions/fixtures/` through a
  stand-in `fetch`, never the network: the two requests and the core's rules, No Japanese
  Captions, each failure, and a track on another host refused (`youtube-requests.test.ts`); one
  request per video, kept for the session, the waits after a 429 on a fake clock, Try again, and
  Zenbu Captions off (`captions-service.test.ts`); and, in happy-dom, a watch page asking once per
  video and nothing for seeking, line moves, Repeat, or speed, and asking again only once the wait
  is over (`youtube-page.interaction.test.tsx`), and the follower's controls, ads, the learner's
  speed, and hiding YouTube's captions (`youtube-follower.interaction.test.tsx`).
- **In Chrome,** by hand or by an agent: load `dist-test/`, open the side panel, the popup, and
  Settings in light and dark, see "The dictionary is ready." from the side panel and the test
  surface, close the offscreen document from `chrome://extensions` (Inspect views) and check
  again, and on both test pages open the menu and the dialog, Tab through it, and close it with
  Esc and with a click outside. Until #952 moves it into the repository, agents use the agent
  Chrome harness in the main checkout's `tmp/agent/agent-chrome`, whose daemon must resume the
  targets it attaches to, or the dictionary worker stays paused and every request fails after
  10 seconds (#1057). Proof goes under
  `tmp/agent/verify/`.
