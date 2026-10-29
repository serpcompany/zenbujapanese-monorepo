# The extension's page lookup

How the extension underlines words on a page and opens the word popup. What a learner sees is in
[`page-lookup.md`](../../apps/extension/docs/product/page-lookup.md) and
[`word-popup.md`](../../apps/extension/docs/product/word-popup.md); the rest of the extension is
in [`extension.md`](extension.md).

## The page script

`src/content/page-lookup.ts` is built as `page-lookup.js`, a content script with no `matches` in
the manifest. The service worker registers it at run time for the sites Zenbu holds
(`keepPageScriptRegistered`, `src/service-worker/page-scripts.ts`), with
`chrome.scripting.registerContentScripts`: at its start, and on `permissions.onAdded` and
`onRemoved`. On a site just given it also runs the script in the site's open tabs, so they start
with no reload; on a site taken back it sends `stopPageLookup` to each tab whose address Chrome
now hides, and the script takes away what it drew. The language-data host and YouTube, which the
manifest holds for other reasons, are never registered. The test build also holds
`http://allowed.localhost/*`, where the browser tests' words page is served.

`activeTab` gives no way in: Chrome grants it only from a click on the toolbar icon, which opens
the side panel, and a test can't click the icon. The header's Allow on This Site and Turn On for
Every Site (`src/shared/every-site.tsx`) ask Chrome with `chrome.permissions.request`.

## Reading and drawing

`startPageLookup` (`src/page-lookup/page-lookup.ts`) takes the browser as a parameter, so the
pieces are tested apart:

- **Settings:** `askSettings()` once, then `onSettingsChanged()`. `isZenbuOn(host, settings)`,
  from `sites.off`, starts and stops it; a reading aid's change redraws in place.
- **Text:** `japaneseText` (`walker.ts`) finds the text nodes to read and leaves out controls,
  editable text, navigation, fixed and sticky elements, and Zenbu's own. A `MutationObserver`
  hands it what the page adds.
- **Lookups:** `scanner` (`scan.ts`) cuts each node into chunks of up to the core's segmentable
  length (`chunks.ts`), at most four at once, and asks `segmentText`. A `not-ready` answer puts
  the node back and waits, from 2 to 10 seconds, so nothing is underlined and no click is taken
  until the dictionary is in. `glossCache` (`glosses.ts`) asks `lookUpPopupCard` for Word
  Meanings' short meanings, once a word. Nothing calls the core's `Dictionary.search()`.
- **Underlines:** two `Highlight`s, light and dark, under `CSS.highlights`, with one adopted
  stylesheet of `::highlight()` rules (`underline.ts`). The tone comes from the text's colour.
  The API needs no fallback in Chrome 138 and later.
- **Reading aids:** with any on, `annotate.ts` replaces the text node with spans marked
  `data-zenbu-aid`, which the walker skips; with all off, the page's nodes stay as they were.
- **The click:** a capture-phase listener finds the word under the pointer from the drawn
  ranges, and leaves a modified or middle click, Enter on a link, and a click with a selection
  to the page.

## The popup

`wordPopupHost` (`src/word-popup/popup-host.tsx`) mounts `WordPopup` with `mountInShadowRoot`
next to the word, places it inside the window (`position.ts`), and moves it as the page scrolls
or resizes. Escape and a click outside close it and give focus back; while its More menu is open
(`[role="menu"][data-open]`, `open-menu.ts`), Escape is the menu's. The shadow host is the
popup's layer (`position: fixed`, the highest `z-index`), and the placed box inside it has none,
so the More menu, which portals to the shadow root's surface, stacks over the card; a `z-index`
on the box made a stacking context the menu's `z-50` was below. Open Full Entry
calls `openPanel(route)` from the click: the service worker opens the side panel before it awaits
anything, so the click's activation carries through one message (checked in Chromium by the
browser tests; no fallback is built). Share and Copy Link use `websiteOrigin` and `wordPath`.
Translate's Japanese source draws the same popup in the panel (`src/translate/source-words.tsx`).

An error's message never holds the page's text or a word.

## Checks

The browser tests in `e2e/page-lookup.spec.ts`, `e2e/page-lookup-before-data.spec.ts`, and
`e2e/word-popup.spec.ts`, on `test-pages/words.html` and its dark version, with the fixture
release's dictionary ([`extension-browser-tests.md`](extension-browser-tests.md)). The unit and
DOM tests sit beside the code.
