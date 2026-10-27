# The extension's side panel

How the browser extension's side panel ([`extension.md`](extension.md)) is built, opened, and
checked. What it does for a learner is in its
[product page](../../apps/extension/docs/product/side-panel.md). Its code is in
`apps/extension/src/side-panel/` and `src/service-worker/side-panel.ts`.

## How it's built

The panel draws its header, the tab bar, and the Back row over a page; a tab or a page draws only
its content. A tab is a line in `tabs` (`src/side-panel/tabs.tsx`): its id, label, icon, and
`Content`, which gets `open(page)`. A page is a kind in `PanelPage` (`route.ts`) and a line in
`pages` (`pages.tsx`). Each tab keeps its own stack of pages (`navigation.ts`), and Back pops one.

- **The toolbar icon opens it.** The manifest's `action` has no popup, and the service worker
  calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` when it starts
  (owner, 2026-10-28). The header's trailing side is `HeaderControls`, which #959 fills.
- **`openPanel(route)` opens it, from a click.** An extension page or a content
  script calls it in the click handler itself, before any `await`. Chrome opens a side panel only
  in response to a user gesture, and the gesture lasts through one message only if the service
  worker calls `chrome.sidePanel.open` before it awaits anything: checked in Chrome 156 on
  2026-10-28 from a content script, an extension page in a tab, and a toolbar popup, and refused after
  awaiting `chrome.storage`, `chrome.windows.getLastFocused`, or a timer. So the service worker
  (`src/service-worker/side-panel.ts`) calls `open` first, on the sender tab's window or, from
  a page with no tab, the current one. Then it saves the route in `chrome.storage.session` under
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
  failed, every tab but Translate, which doesn't need it, draws `DictionaryProgress`
  (`src/shared/dictionary-progress.tsx`) instead of its content, and the tab bar stays. A failure
  adds Try Again, which calls `useDataState()`'s second item to start again.
- **Focus follows the page shown.** Opening a page focuses its Back row; Back focuses the Back row
  of the page it reveals, or the tab's panel.
- **The tab bar is compact, an exception to stock sizes.** Its triggers set `px-0.5 py-1 text-xs`
  and stack the icon over the label, and its list drops the stock `h-8`. Measured in Chrome 156
  at 320 px (`tmp/agent/verify/978/tab-bar-sizes.json`): each trigger is 60 px wide; at the stock
  `text-sm` and padding, Translate's label needs 61 px and gets 46, and Images' needs 48 and gets
  46, so both are cut (Translate still at 380 px), and with the icon beside the label every label
  gets 24 px. The compact bar shows all five whole at 320 px.

## Checks

- **Unit and DOM tests,** with `pnpm test` in `apps/extension`: the manifest with no popup;
  routes and tab stacks; the service worker opening the panel from the toolbar icon, calling
  `open` before it awaits anything, handing the route over, and leaving none when Chrome refuses;
  and, in happy-dom, the five tabs and their empty states, the arrow keys, pages over a tab and
  Back, focus after each, the last tab, the sign-up links, the dictionary progress on every tab
  but Translate, Try Again, and `openPanel` through a fake Chrome to the panel, closed and open.
- **In Chrome,** in the agent Chrome harness ([`extension.md`](extension.md), Checks): open the
  side panel from the toolbar icon and with `openPanel` from a click, closed and open, and check
  that nothing scrolls sideways at 320 px. Check it in the side panel itself: in a background tab,
  `side-panel.html` waits for the tab to come to the front before it hides the tab it left.
