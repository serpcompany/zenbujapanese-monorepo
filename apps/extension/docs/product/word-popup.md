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
More menu open, it waits and closes when the menu shuts, if the word is still out. Escape,
Close, and a click outside close it and give focus back to where it was.

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
- **Pronounce**, and a click on the pitch accent, speak the reading as the app does: in the best
  Japanese voice on this computer, at 0.82 of the default rate. A premium voice comes first,
  then an enhanced one, then any other on this computer, with Apple's Eloquence voices (Eddy, Flo,
  and the rest) last. Chrome's online voices, such as Google 日本語, are never used, chosen or by
  default (#1122's D4): a computer whose voice list has no Japanese voice of its own says "This
  browser can't pronounce Japanese." and speaks nothing, as the Translate tab stays silent. Only
  when Chrome lists no voices at all does the utterance go out with its language alone. A speaker
  asks Chrome for its voices when it appears, so a click usually speaks at once; a click before
  they are listed waits, up to a second, for a voice of the computer's own, and a later click
  replaces it. A click while a word is spoken stops it and speaks the new one whole. Word Detail
  speaks the same way, its meanings' Speak in English too; every extension page and the popup's
  shadow root pass this rule to `@zenbu/ui`'s pronounce button (`PronounceWithoutLocalVoice`), and
  the website keeps the browser's own voice instead ([`ui.md`](../../../../docs/agents/ui.md)).

## Checks

The browser tests (`e2e/word-popup.spec.ts`), on a light and a dark page, each with every
reading aid off and with the default settings (Furigana on): "a click on a word
opens its popup with headword, reading, pitch, badges and meanings…", "Open Full Entry sends
Word Detail and the entry, and opens the closed side panel", "several entries open on a
choice, the one the sentence links first…", "the popup stays inside the window for a word at each edge, and follows the page as it
scrolls until its word is gone", "closes on Escape,
Close and a click outside…", "a word in a link opens the popup…", and "Share and Copy Link put
the word's address on the clipboard…"; the first also checks the popup's font loads.
DOM tests: `src/word-popup/word-popup.interaction.test.tsx`,
`src/word-popup/popup-host.interaction.test.tsx` for the fullscreen element, the bare video,
the open and close events, and closing when the More menu shuts, and
`src/word-popup/position.test.ts`; in Translate, `src/translate/source-words.interaction.test.tsx`.
The voice: `packages/ui/src/dictionary/voice.test.ts` (the order above, and each surface's rule
when only an online voice speaks Japanese), `packages/ui/src/dictionary/pronounce-button.interaction.test.tsx`
(the voice, `ja-JP`, the 0.82 rate, the extension's "can't pronounce", a second click, and voices
that load late or never), and the extension's rule at its roots: `src/content/shadow-mount.interaction.test.tsx`
and `src/pages/mount-page.interaction.test.tsx`, "…says it can't pronounce Japanese, and speaks nothing…". On a Mac
whose Japanese voices are Kyoko and the eight Eloquence ones, the test build in the agent's Chrome
picks Kyoko, as the app does (2026-10-29, Chrome 156). How it sounds is one of the owner's checks
in Chrome on his Mac (#987): テーブル spoken whole, in the popup and in the side panel.
