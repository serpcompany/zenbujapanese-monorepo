# Word popup

The word popup opens from a click on an underlined word on a page
([`page-lookup.md`](page-lookup.md)) and on a word of Translate's Japanese text
([`translate.md`](translate.md)). It is the word's card, as in the app: drawn with `@zenbu/ui`'s
word components in Zenbu's look, whatever the page's styles, light or dark as the system is set.
The text is in `src/word-popup/labels.ts` and Word Detail's labels.

## What it shows

| Part | What a learner sees |
| --- | --- |
| The word | The headword with its furigana, its romaji under it when Romaji is on, and Share and More actions beside it. |
| Pronunciation | The reading's pitch accent where the dictionary has one, and Pronounce. |
| Badges | A badge for each frequency dictionary turned on in Settings, in Settings' order: JLPT Levels' level, such as N3, and YouTube's rank. |
| Meanings | The word's part of speech, then its meanings, numbered. |
| At the foot | Close, and Open Full Entry. |

Several words written the same way, such as 要, open a choice first: "Words written 要", "Choose
the word you mean.", and each word with its reading, part of speech, and first meanings. A choice
opens that word's card, with Back to the list.

While it looks the word up it says "Looking up…". A word the dictionary doesn't have: "This
word isn't in the dictionary."; a lookup that fails: "The dictionary couldn't answer. Try again."

## Where it goes

On a page, it opens beside the word, inside the window for a word at any edge, and follows the
word as the page scrolls. Once the word scrolls wholly out of the window, it closes, unless its
More menu is open. Escape, Close, and a click outside close it and give focus back to where it
was.

In a page's fullscreen element, such as a video player, it opens inside that element, so it shows
over the video, and moves back to the page when fullscreen ends. A bare `<video>` in fullscreen
can't hold other elements, so there it stays in the page's body, behind the video; YouTube's
player is an element that can hold it. It tells the page script's other parts once when it
opens and once when it closes (`src/word-popup/popup-events.ts`), which pausing the video (#964)
uses. In Translate, it opens under the text, and Escape and Close give focus back to the
word.

## Its actions

- **Open Full Entry** opens the word's Word Detail in the side panel, opening the panel if it is
  closed, and closes the popup ([`word-detail.md`](word-detail.md)). From a choice, Word Detail
  has the other words written the same way too.
- **Share** opens the system's share sheet with the word, its meanings, and its address on
  zenbujapanese.com. Where there is no share sheet, it copies the address and says "Link copied".
- **Copy Link** copies the word's address on zenbujapanese.com, and says "Link copied". Where
  nothing can copy: "Couldn't copy. Try again."

## Checks

The browser tests (`e2e/word-popup.spec.ts`), on a light and a dark page, each with every
reading aid off and with the default settings (Furigana on): "a click on a word
opens its popup with headword, reading, pitch, badges and meanings…", "Open Full Entry sends
Word Detail and the entry, and opens the closed side panel", "several entries open on a
choice…", "the popup stays inside the window for a word at each edge, and follows the page as it
scrolls until its word is gone", "closes on Escape,
Close and a click outside…", "a word in a link opens the popup…", and "Share and Copy Link put
the word's address on the clipboard…"; the first also checks the popup's font loads.
DOM tests: `src/word-popup/word-popup.interaction.test.tsx`,
`src/word-popup/popup-host.interaction.test.tsx` for the fullscreen element, the bare video, and
the open and close events, and `src/word-popup/position.test.ts`; in Translate,
`src/translate/source-words.interaction.test.tsx`.
