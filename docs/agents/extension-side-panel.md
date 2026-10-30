# The extension's side panel

How the browser extension's side panel ([`extension.md`](extension.md)) is built, opened, and
checked. What it does for a learner is in its
[product page](../../apps/extension/docs/product/side-panel.md). Its code is in
`apps/extension/src/side-panel/` and `src/service-worker/side-panel.ts`.

## How it's built

The panel draws its header, the tab bar, and the Back row over a page; a tab or a page draws only
its content. A tab is a line in `tabs` (`src/side-panel/tabs.tsx`): its id, label, icon, and
`Content`, which gets `open(page)` and `shown`, true while its tab is chosen and no page is over
it. Every tab's `Content` stays mounted, so a tab that reads Chrome or follows something does it
only while `shown`. A page is a kind in `PanelPage` (`route.ts`) and a line in
`pages` (`pages.tsx`). Each tab keeps its own stack of pages (`navigation.ts`), and Back pops one.
The tabs are the app's Translate, Player, and Account, in its order (#1129). The app's Look Up
has no tab: the extension has no dictionary search. Translate's `Content` is `TranslateTab` (`src/translate/translate-tab.tsx`,
[`translate.md`](../../apps/extension/docs/product/translate.md)), whose Image row opens
`{ page: 'image-search' }` (`src/translate/image-search-page.tsx`). Account's is `AccountTab`
(`src/side-panel/account-tab.tsx`), the place sign-in will show (#960, #961). Player's is
`VideoTab` (`src/video-tab/video-tab.tsx`,
[`video-tab.md`](../../apps/extension/docs/product/video-tab.md)), with Recent under its empty
state only, when no video is open; the code keeps the Video tab's names. It reads the active tab
(`chrome.tabs.query`, then `tabs.onActivated` and `tabs.onUpdated`) once it is first shown, asks
for the video's captions, and follows the video on its port
([`extension-captions.md`](extension-captions.md#the-player-tabs-port)) only while shown. The
panel has no Word Detail pages (#1124): a word clicked in Translate or the transcript opens its
card on the page through a `word-popup` port, and Open Full Entry expands a card in place
([A word's card on the page](#a-words-card-on-the-page)).

- **The toolbar icon opens it.** The manifest's `action` has no popup, and the service worker
  calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` when it starts
  (owner, 2026-10-28); if Chrome refuses, it reports `side-panel-behavior` once
  ([`extension-error-reports.md`](extension-error-reports.md)). The header's trailing side is
  `HeaderControls`: the site switch and the menu, which has the reading aids, Zenbu Captions, and
  Settings ([The header's site](#the-headers-site)).
- **The `openPanel` message opens it, from a click.** `{ target: 'service-worker', openPanel:
  route }` reaches the service worker's handler. Since #1124 only the agent harness and the tests
  send it; nothing in the extension does. A sender sends it in the click handler itself, before
  any `await`. Chrome opens a side panel only
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
  `storage`), `translate`, the first tab, until a tab is chosen. A tab id from the five tabs before #1129 is read as
  the tab that took it over (`movedTabs` in `panel-storage.ts`): `video` and `recent` as
  `player`, `images` as `translate`, and `words` as `account`; anything else, `lookUp` included, as
  `translate`. The
  panel saves the tab it opens on, so the old id is gone after one open. Nothing syncs.
- **The test page** (`{ page: 'test' }`) is the test build's: `isPanelRoute` refuses it unless
  `import.meta.env.MODE` is `test`, as it is in Vitest and `pnpm build:test`.
- **Before the dictionary is ready,** while `useDataState()` says it is checking, downloading, or
  failed, every tab but Translate, which doesn't need it, draws `DictionaryProgress`
  (`src/shared/dictionary-progress.tsx`) instead of its content, and the tab bar stays. A page
  over any tab, Translate's too, draws it under its Back row instead of the page, and the tab
  below keeps what it holds, such as Translate's box. A failure adds Try again, which calls
  `useDataState()`'s second item to start again.
- **Focus follows the page shown.** Opening a page focuses its Back row; Back focuses the Back row
  of the page it reveals, or the tab's panel.
- **The tab bar is compact, an exception to stock sizes.** Its triggers set `px-0.5 py-1 text-xs`
  and stack the icon over the label, and its list drops the stock `h-8`. Measured in Chrome 156
  at 320 px (`tmp/agent/verify/978/tab-bar-sizes.json`): each trigger is 60 px wide; at the stock
  `text-sm` and padding, Translate's label needs 61 px and gets 46, and Images' needs 48 and gets
  46, so both are cut (Translate still at 380 px), and with the icon beside the label every label
  gets 24 px. The compact bar showed all five whole at 320 px; the three tabs since #1129 each get
  a third of the bar.

## A word's card on the page

A word clicked in the panel (`src/translate/source-words.tsx`, which the transcript draws too)
asks `services.pagePopup`, `popupOnActiveTab()` in `src/word-popup/page-popup.ts`, to show the
card on the active tab. It connects `chrome.tabs.connect(tabId, { name: 'word-popup', frameId: 0 })`
and posts `{ target: 'word-popup', show: { text, ids, fromBottom, side } }`: `fromBottom` is the
word's distance from the panel's bottom, and `side` is `chrome.sidePanel.getLayout()`'s, read only
where it exists (Chrome 140; the extension's minimum is 138), else `right`. Both content scripts,
`youtube.ts` and `page-lookup.ts`, serve the port with `servePagePopups`
(`src/word-popup/page-popup-server.ts`): with Zenbu on for the site, the page's popup host opens
the card at the window's edge, `innerHeight - fromBottom` from its top
(`edgePlacement` in `position.ts`), and answers `{ shown: true }`. The page closing the card
disconnects the port; the panel disconnecting closes it.

- **A port that drops before `shown` is a tab that can't,** such as `chrome://`, the Web Store, a
  PDF viewer, a site where Zenbu is off, or a tab with no content script: the panel then draws the
  card inline under the word, at the popup's size or the line's width where that is narrower. A
  drop after `shown` is the card closing.
- **One card at a time.** A newer request ends any not yet shown. One already shown is left for
  the page to replace: its host hands the place to the next card, which tells the old one's port
  it closed. Only the latest request's close or failure ends the rest. A page keeps one popup
  across its hosts (`Symbol.for('zenbujapanese.shown-word-popup')`), handed over without a close
  and open between, so the video doesn't play for a moment between two cards.
- **A press keeps a card when it lands in it or a layer it opened.** Base UI draws a menu or
  sheet in a `[data-base-ui-portal]` outside the card, so the page's host holds a press whose
  `composedPath()` has the card, and any open portal layer (`hasOpenLayer` in `open-layer.ts`, on
  the shadow root) holds it too. In the panel, a press inside a word or the inline card is marked
  through React's events, which pass through portals, and an open layer holds it as on the page.

## The header's site

The site switch is for the active tab's site (`src/side-panel/active-site.ts`), and the header
knows it only from `tab.url` (`chrome.tabs.query`). Chrome withholds `tab.url` from an extension
without `tabs` exactly where it withholds a content script's access, so no content script can
name a site the header can't see. The header has four states:

- **The switch** (`open`): `tab.url` is there and `chrome.permissions.contains` says Zenbu has
  the site.
- **Allow** (`no-access`): `tab.url` is there, from `activeTab` after a click on the toolbar icon,
  but Zenbu doesn't have the site. The menu names the host and has Allow on This Site, which calls
  `chrome.permissions.request` for that origin.
- **Can't see** (`unseen`): no `tab.url`. The menu says so and how to let Zenbu in through
  Chrome's site access for the extension. It offers no Allow on every site: that is Turn On for
  Every Site, on the welcome tab and in Settings' Sites.
- **Can't run** (`cant-run`): `tab.url` shows a page no extension runs on (`pageAt` returns
  `null`): Chrome's own pages, other extensions, `about:`, files, and the Chrome Web Store.

It reads the site again when another tab comes to the front (`tabs.onActivated`), a tab finishes
loading (`tabs.onUpdated`), and Zenbu's site access changes (`permissions.onAdded` and
`onRemoved`). The fake Chrome in the tests (`src/test/fake-chrome.ts`) gives `tab.url` only where
a granted origin covers it or the toolbar icon was clicked on that tab, and its `grant` and
`revoke` fire `onAdded` and `onRemoved`, so the tests reach only the states Chrome does.

## Checks

- **Unit and DOM tests,** with `pnpm test` in `apps/extension`: the manifest with no popup;
  routes and tab stacks; the service worker opening the panel from the toolbar icon, calling
  `open` before it awaits anything, handing the route over, and leaving none when Chrome refuses;
  a refused `setPanelBehavior` reported once; and, in happy-dom, the three tabs with their labels
  and icons, each tab's screen (Player's transcript is checked in `src/video-tab/`), Translate's
  Image row, the arrow keys, pages over a tab and Back, focus after each, the last tab and the
  five tabs' ids read as the three's, the sign-up links, the dictionary progress on every tab but Translate and on a
  page over Translate, Try again, and the `openPanel` message through a fake Chrome to the panel, closed and
  open. A word's card on the page: `src/word-popup/page-popup.test.ts` (the panel's side) and
  `page-popup-server.test.ts` (the page's), with a fake port. The header: each behavior its [product page](../../apps/extension/docs/product/side-panel-header.md)
  lists, with the test content script beside it on one fake Chrome. The browser tests open
  `side-panel.html` with no popup, and `e2e/side-panel-tabs.spec.ts` its three tabs, each tab's
  screen, and the old ids read as the three's, and `e2e/transcript-card-on-page.spec.ts` a
  transcript word's card on the stand-in watch page
  ([`extension-browser-tests.md`](extension-browser-tests.md)).
- **In Chrome,** with the `verify-extension` skill ([`extension.md`](extension.md), Checks): open the
  side panel from the toolbar icon and with the `openPanel` message from a click, closed and open, and check
  that nothing scrolls sideways at 320 px. Check it in the side panel itself: in a background tab,
  `side-panel.html` waits for the tab to come to the front before it hides the tab it left.
  For the header: a click on the toolbar icon gives `activeTab` and the tab's address; Allow's
  prompt; switching tabs; clicking the icon with the panel already open; `localhost` with the
  test build showing the switch; and a reading aid and the site's switch turned off and on from
  a test page.
