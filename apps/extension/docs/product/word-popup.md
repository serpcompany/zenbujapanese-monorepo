# Word popup

The word popup opens from a click on an underlined word on a page
([`page-lookup.md`](page-lookup.md)), and on a word of the side panel's Japanese, in Translate
([`translate.md`](translate.md)) and the Player tab's transcript ([`video-tab.md`](video-tab.md)),
where a click opens it on the page beside the panel and Enter or Space opens it in the panel. It is the word's card, as in the app: drawn with `@zenbu/ui`'s
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
uses.

## A word's card from the side panel

A click on a word in the side panel, in Translate's Japanese or the Player tab's transcript,
opens its card on the page in the tab the learner is on, as this popup: beside the panel's edge,
at the right of the page with the panel on the right and at its left with the panel on the left,
level with the word clicked as far as the window allows. It stays there while the page scrolls.
The panel shows no card. A click on another word puts that word's card in its place. Escape, in
the panel or on the page, a press outside it in the panel, and Escape or a click outside it on
the page close it. A page shows one popup: a click on a word on the page puts that word's card in
the place of the panel's, and a panel word's in the place of the page's.

A word opened from the keyboard, with Enter or Space, shows its card in the panel instead, under
the word's line, with focus in the card, and opens none on the page; this is the one exception to
the panel showing no cards, since focus can't move from the side panel into the page, so a card
there is out of a keyboard user's reach (the owner's decision on #1124, 2026-10-30). Escape
closes it and gives focus back to the word. A click on a word afterwards still opens its card on
the page, and a key on a word closes a card the page shows for the panel.

Where the tab can't show one, the card opens in the panel too, under the word's line, at
this popup's size or the line's width where that is narrower: on a `chrome://` page, the Chrome
Web Store, a PDF, a site where Zenbu is off, and a tab with no Zenbu in it, such as one opened before Zenbu was installed or updated. There
Escape and a press outside it, its menu, or the line's words close it. Escape gives focus back to
the word, without scrolling; a press leaves focus where it lands. While its menu is open, a press
anywhere closes only the menu. A card never shows on the page and in the panel at once.

How it's built: the panel connects a `word-popup` port to the tab's content script
(`src/word-popup/page-popup.ts`), whose popup host shows the card
(`src/word-popup/page-popup-server.ts`); a tab that answers nothing before the card shows is one
that can't. A press keeps the card open when it lands in the card or in a layer the card opened,
such as its More menu or the conjugation table's sheet, which Base UI draws in a portal outside
the card, on the page's shadow root and in the panel (`src/word-popup/open-layer.ts`).

## Its actions

- **Open Full Entry** expands the card in place into the word's full entry, Word Detail
  ([`word-detail.md`](word-detail.md)): the card keeps its width, grows to the window's height
  less a rem, and the entry scrolls inside it while the page stays still. A row of Back goes over
  it. The entry's header has Word Detail's own actions, Open on zenbujapanese.com, Share and More
  actions, and its headword is the side panel's size. A word, kanji or form opened inside it opens
  over it, Back returns through each, and the last Back folds the entry back into the card. Focus
  goes to the entry, so the arrow and Page keys scroll it, and Shift-Tab reaches Back. Its notices, such as "Link copied", show in a line at the card's foot. From a
  choice, the entry has every word written the same way, as tabs, starting on the one chosen. It
  opens nothing in the side panel.
- **Share** opens the system's share sheet with the word, its meanings, and its address on
  zenbujapanese.com. Where there is no share sheet, or the system refuses one, it copies the
address and says "Link copied"; closing the sheet does nothing more.
- **Copy Link** copies the word's address on zenbujapanese.com, and says "Link copied". Where
  nothing can copy: "Couldn't copy. Try again."
- **Pronounce**, and a click on the pitch accent, speak the reading as the app does: in the best
  Japanese voice on this computer, at 0.82 of the default rate. A premium voice comes first,
  then an enhanced one, then any other on this computer, with Apple's Eloquence voices (Eddy, Flo,
  and the rest) last. Chrome's online voices, such as Google 日本語, are never used, chosen or by
  default (#1122's D4): a computer whose voice list has no Japanese voice of its own says "This
  browser can't pronounce Japanese." and speaks nothing, as the Translate tab stays silent, and so
  does a click when Chrome still lists no voices a second later. The message stays until Chrome
  lists a voice of the computer's own; then it goes, and the next click speaks. A speaker
  asks Chrome for its voices when it appears, so a click usually speaks at once; a click before
  they are listed waits, up to a second, for a voice of the computer's own, and a later click
  replaces it. A click while a word is spoken stops it and speaks the new one whole. Word Detail
  speaks the same way, its meanings' Speak in English too; every extension page and the popup's
  shadow root pass this rule to `@zenbu/ui`'s pronounce button (`PronounceWithoutLocalVoice`), and
  the website keeps the browser's own voice instead ([`ui.md`](../../../../docs/agents/ui.md)).

## Checks

The browser tests (`e2e/word-popup.spec.ts`), on a light and a dark page, each with every
reading aid off and with the default settings (Furigana on): "a click on a word
opens its popup with headword, reading, pitch, badges and meanings…", "Open Full Entry expands
the popup in place into the full entry, which scrolls inside the card, and opens no side panel",
"several entries open on a choice, the one the sentence links first, and the full entry offers
them all", "the popup stays inside the window for a word at each edge, and follows the page as it
scrolls until its word is gone", "closes on Escape and a click outside, with no Close
button…", "a word in a link opens the popup…", and "Share and Copy Link put the word's address
on the clipboard…"; the first also checks the popup's font loads. Once: "the expanded card's Open on
zenbujapanese.com opens the word's page in a new tab and keeps the card", and, on a light page, "opens
the More menu over the popup, and one Escape closes the menu, the next the popup", and on the
YouTube stand-in "opens the More menu over a caption word's popup on YouTube, in and out of
fullscreen", each checking the menu's item is the topmost element where it is drawn.
DOM tests: `src/word-popup/word-popup.interaction.test.tsx` ("expands in place into the
word's full entry…", "shows Word Detail's own header actions in the expanded card…", "asks which
word is meant…, and offers them all in the full entry"),
`src/word-popup/popup-host.interaction.test.tsx` for the fullscreen element, the bare video,
the open and close events, closing when the More menu shuts, Escape with the menu open and
shutting, the host's layer, a card at the panel's edge, one card on a page, and "stays open for a
press in a layer it opened…", and
`src/word-popup/position.test.ts`.

A word's card from the side panel: `e2e/transcript-card-on-page.spec.ts`, "a word clicked in the
transcript opens its card on the watch page, beside the panel and level with its row, with none
in the panel", on the YouTube stand-in with the panel page following that tab;
`src/word-popup/page-popup.test.ts` (the panel's side: the panel's edge, shown and closed, a tab
that can't, one card replacing another, a card left on a tab the learner left) and
`src/word-popup/page-popup-server.test.ts` (the page's side: where it shows, what it refuses,
closing either way, one answer with both content scripts in a frame, and a card replaced by
another part's, by hand-over or across a press); `e2e/transcript-card-on-page.spec.ts`, "with
Every Site given, one card answers a transcript word on YouTube, and Escape in the panel closes
it", and "a transcript word opened with Enter or Space shows its card in the panel, with focus
in it…"; in the panel,
`src/translate/source-words.interaction.test.tsx` ("opens a word's card on the page…", "lets go
of the word when the page closes its card…", "shows the card under the line… when the page
can't show one", "shows a word's card in the panel, with focus in it, when Enter opens it…", the
same for Space, and "opens a word's card on the page from a click after a key opened one in the
panel…"), the keyboard's card for the transcript and Translate in
`src/video-tab/transcript.interaction.test.tsx` and
`src/translate/translate-tab.interaction.test.tsx` ("…when a key opens it"), and `e2e/side-panel-popup.spec.ts`, "where the page can't show a word's card,
its popup opens in the side panel and stays inside it at its narrowest width".
The voice: `packages/ui/src/dictionary/voice.test.ts` (the order above, and each surface's rule
when only an online voice speaks Japanese), `packages/ui/src/dictionary/pronounce-button.interaction.test.tsx`
(the voice, `ja-JP`, the 0.82 rate, the extension's "can't pronounce", a second click, and voices
that load late or never), the popup's "…says it can't pronounce Japanese while the browser lists no
voices…", and the extension's rule at its roots: `src/content/shadow-mount.interaction.test.tsx`
and `src/pages/mount-page.interaction.test.tsx`, "…says it can't pronounce Japanese, and speaks nothing…". On a Mac
whose Japanese voices are Kyoko and the eight Eloquence ones, the test build in the agent's Chrome
picks Kyoko, as the app does (2026-10-29, Chrome 156). How it sounds is one of the owner's checks
in Chrome on his Mac (#987): テーブル spoken whole, in the popup and in the side panel.
