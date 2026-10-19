# Share sheet

Zenbu Japanese is in the iPhone and iPad share sheet's row of apps. Sharing a word, a sentence, or a
photo to it opens a card inside the sheet, over the app the learner was in, without switching to
Zenbu. Everything on the card runs on the device, as it does in the app. How it's built is in
[`ios-share-sheet.md`](../../../../docs/agents/ios-share-sheet.md).

- Source: #394. The owner chose this, option B of three prototypes, on 2026-10-19: a card inside
  the sheet, the route Apple supports for a share extension, rather than opening the app.
- The Mac has no share-sheet card: the extension is built for iPhone and iPad only.
- The card has no **Open in Zenbu** button: Apple documents no way for a share extension to open
  its app, so the card stands on its own.

Zenbu appears when what's shared is text, or one image. Selected text in Safari, Notes, Mail, or
any app's **Share…** shares text; a page's address on its own doesn't bring Zenbu up. If Zenbu isn't
in the row, **More** lists it to turn on.

## A word

Japanese written or read as exactly one entry, or a form of one (食べた), or one word written on
its own (駅), shows that word's card: the headword with its furigana, its pitch accent and a button
that says it, its part of speech, its numbered meanings, and its JLPT level and frequency ranks, as
the top of Word Detail shows them. A rank opens its details, as in the app.

Check: package `ShareCardTests.conjugatedWord` and `wordWrittenAlone`; UI
`ShareSheetUITests.testAWordsFormShowsItsCardAndSavesItToAListInTheApp`.

## A sentence or other text

Other Japanese, such as a sentence, shows:

- **Translation**, into English by Apple Translation, on the device. When Japanese and English
  aren't downloaded for Apple Translation, the card says to download them in Zenbu's Translate
  tab; when the device can't translate, it says a translation isn't available.
- **Shared Text**, the text itself, which can be selected.
- **Words**, each word in it with its reading and short meaning, in the order they come, each
  once, without particles. A word read several ways that the text doesn't settle, such as かみ
  on its own, lists each word it could be, up to four. Each row opens that word's card in the
  sheet, and **Back** returns to the text.

English or romaji has no translation; **Words** lists up to five of the dictionary's words for it.
Blank text says there's nothing to look up. For a long text, **Words** lists those in its first
2,000 characters.

Check: package `ShareCardTests` (`sentence`, `sharedReading`, `english`, `blank`),
`ShareCardTranslationTests`, and `SharedItemTests`; UI
`ShareSheetUITests.testASentenceListsItsWordsAndEachOpensItsCard`.

## A photo

A photo or screenshot shows **Text in the Photo**, the Japanese Image Search's recognition reads
in it, line by line, with its **Translation** and **Words** as for a sentence. A photo with no
Japanese in it says so, and a file that isn't an image says it couldn't be opened. The photo is
read at 2,048 pixels on its longer side.

Check: package `ShareCardTests` (`photo`, `photoWithoutJapanese`, `notAnImage`,
`largePhotoIsDownscaled`); UI `ShareSheetUITests.testAPhotoShowsTheJapaneseFoundInItAndItsWords`.

## Saving a word

**Add to List** on a word's card opens the app's own list picker: the learner's lists with a
check beside each the word is in, and **New List**. Lists and known words are the app's: a word
added in the share sheet is in the list the next time Zenbu opens, or at once when it's already
open, and syncs with the Zenbu account like a word added in the app. Swiping a word in **Words**
marks it known, as in Search.

Before Zenbu has been opened once since it was installed or updated, the sheet shows only
**Favorites**; a word saved to it still reaches the app.

Check: package `SharedChangesTests` and `SharedCopyTests`; UI
`ShareSheetUITests.testAWordsFormShowsItsCardAndSavesItToAListInTheApp`.

## What the card leaves out

The card uses Zenbu's default reading aids and frequency dictionaries (JLPT and YouTube), not the
learner's choices in the app, and has no notes, photos, examples, kanji, or conjugations: those
are on the word's page in the app.

## Checked by hand

| By hand | Closest automated check |
| --- | --- |
| Safari, Notes, and Photos list Zenbu in their share sheets, and each kind of share opens its card | `ShareSheetUITests`, which share from Zenbu's own share sheet |
| A sentence's translation on a device with Japanese and English downloaded | `ShareCardTranslationTests`, with a stand-in for Apple Translation |
| The card stays open on an iPhone, under the share sheet's memory limit, for a long sentence and a photo of a page | The memory each card uses, logged in a Debug build ([`ios-share-sheet.md`](../../../../docs/agents/ios-share-sheet.md#memory)) |
| A word saved in the sheet reaches another device through the account | `SharedChangesTests` (the app records the change as its own) |
