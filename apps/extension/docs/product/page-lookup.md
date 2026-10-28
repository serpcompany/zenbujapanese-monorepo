# Page lookup

On a site Zenbu may read, Zenbu underlines the Japanese words on the page that its dictionary
knows, and a click on one opens the word popup ([`word-popup.md`](word-popup.md)). It looks words
up on this computer, in the dictionary it downloaded, so the page's text never leaves it. How it
is built is in [`extension-page-lookup.md`](../../../../docs/agents/extension-page-lookup.md).

## Where it runs

Zenbu asks Chrome for no site at install. It runs on a site the learner gave it:

- **Allow on This Site,** in the side panel header's menu
  ([`side-panel-header.md`](side-panel-header.md)).
- **Turn On for Every Site,** on the welcome tab and in Settings' Sites
  ([`settings.md`](settings.md)), which asks Chrome for every site.
- **Chrome's own site access** for the extension.

A page that is open when its site is given starts at once, with no reload. A site taken back
stops at once, and its underlines, reading aids, and popup go. A click on the toolbar icon alone
doesn't start it: it shows the header the tab's address, and Allow on This Site is the way in.

The site switch in the header turns Zenbu off for one site (`sites.off`): nothing is underlined,
the reading aids go, and a click does what the page does. Turning it on draws everything again,
with no reload.

## Underlines

Each word gets a 2-pixel underline in Zenbu's blue, drawn by Chrome's CSS Custom Highlight API,
so the page's boxes, colours, and links stay as they are. On a page whose text is light, the blue
is lighter. Zenbu underlines what a learner reads, and leaves alone text boxes, buttons, select
menus, editable text, navigation, fixed and sticky bars, and its own popup. Text on screen goes
first; text the page adds later, such as the next page of a feed, is underlined as it comes.

Until the dictionary is ready, nothing is underlined and a click does what the page does. Once
it is, the open pages underline with no reload.

## Reading aids

Each follows Settings and the header menu at once, with no reload. With all of them off, the
page's text is as it was, under its underlines.

| Aid | What it adds |
| --- | --- |
| Furigana | The reading in hiragana over each word's kanji. |
| Romaji | A line in romaji under each paragraph. |
| Word Meanings | Each word's short meaning under it, in the underline's blue. |

Use Selection, in Translate, takes the selected text without them
([`translate.md`](translate.md)).

## A click

A click on an underlined word opens its popup beside it, or a choice when the text is several
words. A click while text is selected doesn't, so selecting works as before. In a link, a plain
click opens the popup and leaves the address alone; a click with Ctrl or Command, a middle
click, and Enter follow the link.

## Checks

The browser tests, on a light and a dark local page (`e2e/page-lookup.spec.ts`): "underlines the
words segment links…", "leaves every element's box and colour as they are…", "shows furigana,
romaji and word meanings…", "underlines nothing and opens no popup on a site turned off…",
"underlines words added to the page later", and "starts on an open page when Chrome grants its
site…"; `e2e/page-lookup-before-data.spec.ts` for the dictionary not yet in. Unit and DOM tests:
`src/page-lookup/words.test.ts`, `src/page-lookup/scan.test.ts`,
`src/page-lookup/page-text.interaction.test.tsx`, and `src/service-worker/page-scripts.test.ts`
for registering the page script for each site Zenbu has.

## Not built yet

Hide Furigana on Known Words and Sentence Translations draw nothing on a page yet: nothing marks a
word known, and pages have no sentence translations. Text with an emoji or another character
outside the basic plane comes back unlinked
([`tech-debt.md`](../../../../docs/tech-debt.md)).
