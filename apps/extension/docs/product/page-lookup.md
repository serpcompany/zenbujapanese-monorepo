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

A page that is open when its site is given starts at once, with no reload, and so does one that
is open when the extension is installed, reloaded, or updated: Zenbu puts its page script back
into the open tabs of the sites it has, and the copy the old extension left takes no more part. A
site taken back
stops at once, and its underlines, reading aids, and popup go; taking back Every Site stops every
tab no other site given still covers, YouTube's too. A click on the toolbar icon alone doesn't
start it: it shows the header the tab's address, and Allow on This Site is the way in (#1099,
[`tech-debt.md`](../../../../docs/tech-debt.md)).

The site switch in the header turns Zenbu off for one site (`sites.off`): nothing is underlined,
the reading aids go, and a click does what the page does. Turning it on draws everything again,
with no reload.

Page Text, in the header's menu and in Settings, is one switch for every site (`pages.pageText`),
on at first. Turned off, every open page loses its underlines and reading aids at once, Zenbu
reads none of the text a page adds, and a click does what the page does; after a reload and a
restart it stays off. Zenbu Captions keep showing on a YouTube video as they do with it on.
Turned on, the open pages draw everything again with no reload. The site switch still turns all
of Zenbu off for its site, whichever way Page Text is.

## Underlines

Each word gets a 2-pixel underline in Zenbu's blue, drawn by Chrome's CSS Custom Highlight API,
so the page's boxes, colours, and links stay as they are. On a page whose text is light, the blue
is lighter, whatever colour space the page writes it in, such as `oklch()`. Zenbu underlines
what a learner reads, and leaves alone text boxes, buttons, labels, summaries, select menus,
editable text, navigation, the page's own ARIA buttons, tabs, menu items, checkboxes, switches,
radios and options, fixed and sticky bars, and its own popup. Text on screen goes
first; text the page adds later, such as the next page of a feed, is underlined as it comes,
ahead of whatever the first scan of a long page has still to read. The first scan has no cap: on
a page the size of a long Wikipedia article, tens of thousands of words, it can take minutes, and
each word drawn costs more as the count grows.

Until the dictionary is ready, nothing is underlined and a click does what the page does. Once
it is, the open pages underline with no reload.

## Reading aids

Each follows Settings and the header menu at once, with no reload. With all of them off, the
page's text is as it was, under its underlines.

| Aid | What it adds |
| --- | --- |
| Furigana | The reading in hiragana over each word's kanji. |
| Romaji | A line in romaji under each paragraph. |
| Word Meanings | Each word's short meaning under it, muted in the page's own text colour, with the transcript's gap before it; its sense's full text is its tooltip and what a screen reader reads. |

A word with a meaning has the Video tab's transcript's gap before it, half the page's root font
size, and none after, so two neighbouring meanings and a meaning after plain text are that far
apart. A word that starts its element, with nothing shown before it, has no gap. The gap comes
from `src/shared/meaning-aid.ts`, which the transcript, Translate's linked words, and the caption
on the player read too.

The meaning is the page's own text colour at 70%. On a page with dark text on light and one with
light text on dark it measures 4.5:1 or better; on a page whose own text is faint it is fainter in
proportion. The side panel and the caption on the player keep their theme's muted text colour
instead, which their contrast checks measure (#1127): they know their theme, and a page has none.

Use Selection, in Translate, takes the selected text without them
([`translate.md`](translate.md)).

## A click

A click on an underlined word opens its popup beside it, or a choice when the text is several
words, or the word is written the same way as others, such as 何 (なに, なん) or 要. A click while text is selected doesn't, so selecting works as before. In a link, a plain
click on the word, or on its furigana, opens the popup and leaves the address alone; a click
with Ctrl or Command, a middle click, and Enter follow the link. A click on a label's, a
summary's, or an ARIA control's words works the control, since Zenbu doesn't underline them.

## Checks

The browser tests, on a light and a dark local page (`e2e/page-lookup.spec.ts`): "underlines the
words segment links…", "leaves every element's box and colour as they are…", "underlines in the
dark page's colour when the page's text is oklch(…)" and "…color(display-p3 …)", "shows furigana,
romaji and word meanings…", "underlines nothing and opens no popup on a site turned off…", "takes the underlines and reading
aids off every open page when Page Text turns off…", "underlines words added to the page later", "underlines words added to a long page before the
rest of its first scan", and "starts on an open page when Chrome grants its site…"; in
`e2e/extension-reload.spec.ts`, "an open page underlines new text and opens popups again after the
extension reloads…"; in `e2e/word-popup.spec.ts`, "a click on the words of a checkbox label or a summary works
the control…" and "a click on the furigana over a word in a link…"; and
`e2e/page-lookup-before-data.spec.ts` for the dictionary not yet in. Unit and DOM tests:
`src/page-lookup/words.test.ts`, `src/page-lookup/scan.test.ts`,
`src/page-lookup/page-text.interaction.test.tsx`, `src/page-lookup/page-lookup.interaction.test.tsx`
for nothing drawn or watched once it stops or Page Text turns off, and everything back when Page
Text turns on, `src/shared/settings.test.ts` for Page Text kept and apart from the site switch,
`src/video/youtube-page-captions.interaction.test.tsx` ("keeps the caption… when Page Text turns
off") for the caption, and `src/service-worker/page-scripts.test.ts` for
registering the page script for each site Zenbu has, putting it back into open tabs on install
and update, and stopping the tabs a site taken back leaves, such as YouTube's when Every Site
goes; `src/page-lookup/hand-over.test.ts` for one running copy per page.

## Not built yet

Hide Furigana on Known Words and Sentence Translations draw nothing on a page yet: the ••• menu
marks a word Known, but pages don't follow it yet (#1187), and pages have no sentence
translations. Text with an emoji or another character
outside the basic plane comes back unlinked
([`tech-debt.md`](../../../../docs/tech-debt.md)).
