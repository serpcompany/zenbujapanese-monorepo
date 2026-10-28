# Word popup

The word popup opens from a click on an underlined word on a page
([`page-lookup.md`](page-lookup.md)) and on a word of Translate's Japanese text
([`translate.md`](translate.md)). It is the word's card, as in the app: drawn with `@zenbu/ui`'s
word components in Zenbu's look, whatever the page's styles, light or dark as the system is set.
The text is in `src/word-popup/labels.ts` and Word Detail's labels.

## What it shows

| Part | What a learner sees |
| --- | --- |
| The word | The headword with its furigana, its romaji under it when Romaji is on, and beside it Share, More actions, and Open Full Entry, an icon (Lucide's Maximize2, the app's arrow.up.left.and.arrow.down.right) named "Open Full Entry" with that tooltip. |
| Pronunciation | The reading's pitch accent where the dictionary has one, and Pronounce. |
| Badges | A badge for each frequency dictionary turned on in Settings, in Settings' order: JLPT Levels' level, such as N3, and YouTube's rank. |
| Meanings | The word's part of speech, then its meanings, numbered. |

Several words written the same way, such as 何 or 要, open a choice first: "Words written 要",
"Choose the word you mean.", and each word with its reading, part of speech, and first meanings.
The word the sentence's reading points to comes first, then the others written that way, which
the core names with the split (`writtenAlike` in `segmentText`). Text that could be several
words, such as で, lists the ones it could be. A choice opens that word's card, with Back to the
list.

While it looks the word up it says "Looking up…". A word the dictionary doesn't have: "This
word isn't in the dictionary."; a lookup that fails: "The dictionary couldn't answer. Try again."

## Where it goes

On a page, it opens beside the word, inside the window for a word at any edge, and follows the
word as the page scrolls. Once the word scrolls wholly out of the window, it closes; with its
More menu open, it waits and closes when the menu shuts, if the word is still out. It has no
Close button: Escape and a click outside close it and give focus back to where it was. With the
More menu open, the first Escape closes the menu, and the next closes the popup; a menu that is
closing doesn't hold an Escape. The More menu opens over the popup: the popup's host element is
its own layer at the top of the page, and the menu is drawn inside it, above the card.

In a page's fullscreen element, such as a video player, it opens inside that element, so it shows
over the video, and moves back to the page when fullscreen ends. A bare `<video>` in fullscreen
can't hold other elements, so there it stays in the page's body, behind the video; YouTube's
player is an element that can hold it. It tells the page script's other parts once when it
opens and once when it closes (`src/word-popup/popup-events.ts`), which pausing the video (#964)
uses. In Translate, it opens under the text, and Escape and a press outside it, its menu, or
the text's words close it. Escape gives focus back to the word, without scrolling; a press leaves
focus where it lands. While its menu is open, a press anywhere closes only the menu.

## Its actions

- **Open Full Entry** opens the word's Word Detail in the side panel, opening the panel if it is
  closed, and closes the popup ([`word-detail.md`](word-detail.md)). From a choice, Word Detail
  has the other words written the same way too.
- **Share** opens the system's share sheet with the word, its meanings, and its address on
  zenbujapanese.com. Where there is no share sheet, or the system refuses one, it copies the
address and says "Link copied"; closing the sheet does nothing more.
- **Copy Link** copies the word's address on zenbujapanese.com, and says "Link copied". Where
  nothing can copy: "Couldn't copy. Try again."

## Checks

The browser tests (`e2e/word-popup.spec.ts`), on a light and a dark page, each with every
reading aid off and with the default settings (Furigana on): "a click on a word
opens its popup with headword, reading, pitch, badges and meanings…", "Open Full Entry sends
Word Detail and the entry, and opens the closed side panel", "several entries open on a
choice, the one the sentence links first…", "the popup stays inside the window for a word at each edge, and follows the page as it
scrolls until its word is gone", "closes on Escape and a click outside, with no Close
button…", "a word in a link opens the popup…", and "Share and Copy Link put the word's address
on the clipboard…"; the first also checks the popup's font loads. Once, on a light page: "opens
the More menu over the popup, and one Escape closes the menu, the next the popup", and on the
YouTube stand-in "opens the More menu over a caption word's popup on YouTube, in and out of
fullscreen", each checking the menu's item is the topmost element where it is drawn.
DOM tests: `src/word-popup/word-popup.interaction.test.tsx`,
`src/word-popup/popup-host.interaction.test.tsx` for the fullscreen element, the bare video,
the open and close events, closing when the More menu shuts, Escape with the menu open and
shutting, and the host's layer, and
`src/word-popup/position.test.ts`; in Translate, `src/translate/source-words.interaction.test.tsx`.
