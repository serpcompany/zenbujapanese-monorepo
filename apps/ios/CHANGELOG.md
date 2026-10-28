# Changelog

All notable user-facing changes to Zenbu Japanese are recorded here.

## Unreleased

## Not released yet: iPad and the Mac

- Zenbu Japanese runs on iPad and on Macs with Apple silicon, as the same app: get it once and
  sign in to the same Zenbu account to keep your known words, lists, notes, photos, settings,
  recent lookups, Recent videos, bookmarks, and profile photo the same everywhere. On iPad it
  turns every way and runs beside other apps, with the tabs at the top, where they open into a
  sidebar; on the Mac the tabs sit in a bar at the top of the window. On the Mac, Settings (⌘,)
  holds your account and preferences, ⌘F goes to Look Up, ⌘⇧I opens Translate's **Image** to
  search an image, and ⌘1 to ⌘4 switch tabs. On the Mac, **Image** pastes an image in place of
  taking a photo, and a photo taken on your iPhone with Continuity Camera opens in Image Search; on
  every device, drag images onto the window to open them there. Right-click a list, a known word, a
  Recent video, or a frequency dictionary on the Mac for what a swipe does on the iPhone.
- On the Mac, clicking a note, or **Add Note** under a word's notes, puts the cursor in the note so
  you can type; the keyboard used to stay with the page.

## [2.1.0]

### Added

- Signed in, more stays the same on all your devices: your notes, photos, settings, and latest 50
  lookups, your profile's name, username, and photo, and the frequency dictionaries you chose,
  which your other devices download on their own, never on cellular or in Low Data Mode. **Clear
  Recent Lookups** asks first and, signed in, clears them on every device.
- Syncing can need a Zenbu subscription, sold in the app; everything on your device stays free,
  and so does syncing your name and username. **Zenbu Account → Subscription** shows yours, with
  **Restore Purchases** and a way to manage it in the App Store.
- Mark a word or kanji **Learning** from **Status** in its **•••** menu, a row's context menu, or a
  right swipe: it gets a yellow tag and its own list in Account, keeps its furigana and meanings
  in Reading Aids, and syncs.
- Sort and filter search results from the **Sorted by** row: by a frequency dictionary, most common
  first (JLPT by level), or known words first, and to unknown, Learning, or known words. Your
  choices stay across launches and apply to Japanese, English, and romaji searches.
- The **•••** menus of a word, a kanji, Example Sentences, and Player end with **Show**:
  **Furigana**, **Furigana on Known Words**, **Word Meanings**, and **Translations**, the same
  switches as Reading Aids. The menu stays open while you flip them.
- Look Up's cap button, beside the pencil and the grid, opens **Grade**: the kanji taught in each
  school grade, in secondary school, and for names (Jinmeiyō), with a filter, a green outline on
  the kanji you know, and how many you know in each. Each kanji shows its meaning under it unless
  you turn off **Show Kanji Meanings** in Reading Aids.
- Each meaning on a word's page shows the example sentence JMdict pairs with it, and the word's
  **Examples** lists those first, even past 100.
- Tap a meaning on a word's page to hear it in English, copy it, or look up one of its glosses,
  each taken whole: 厚生労働省 offers "Ministry of Health, Labour and Welfare", not its pieces.
- Translate's **Listen** has the speaker button too: mute spoken translations while the
  translated cards keep coming.
- Example Sentences says how many sentences it lists, under its title: "3 examples", or "The
  first 100 of more than 100 examples".
- Look up and translate from Shortcuts, Siri, and Spotlight: **Look Up in Zenbu** opens the word
  or its results, from "Zenbu look up" or "Look up in Zenbu", and **Translate with Zenbu** opens
  Translate's Text with the text, from "Zenbu translate" or "Translate with Zenbu".
- Share a word, a sentence, or a photo to Zenbu from any app's share sheet to see its card there,
  without leaving the app: a word's reading, pitch, meanings, and JLPT level, or a sentence's or
  photo's translation and words, each opening its card. **Add to List** saves a word to your lists.
- Look Up finds your notes too: a word or kanji whose note has what you searched for is listed
  under **In your notes**, after the dictionary's matches, with the part of the note that matched.
- **Report a Problem…** in Account sends the developers what happened, with your email for a reply
  if you want one, and says what else goes with it.
- Zenbu reports crashes and freezes, never what you type or say. **Send Crash Reports** stops it.

### Changed

- **Search** is now **Look Up**, and **Clear Recent Searches** is now **Clear Recent Lookups**.
- **Known Words** and **Learning** show Look Up's rows, with each word's meanings, ranks, and tag,
  and kanji as Look Up's kanji rows, in place of dates. Swipe a row or press and hold it to change
  its status.
- A kanji in Look Up's results shows its own meanings, such as 日's "day, sun, Japan, counter for
  days", where it used to show one word's meaning ("Sunday").
- **Share** on a word's or a kanji's page sends its page on zenbujapanese.com with the text, which
  opens it in Zenbu for anyone who has the app.
- Image Search moved from Search's camera button to Translate's **Image** row: take a photo or
  pick one from your library, then tap any word to look it up.
- Translate's home is laid out like Settings: a header, then **Spoken** (Conversation, Listen) and
  **Written** (Image, Text, Document). Tapping a row opens it, with no Start button.
  **Document** opens PDFs and text files.
- Image Search can open up to 8 photos from your library at once.
- Look Up's top bar matches Player's: a small title and the same search field, which slides up while
  you type and keeps your query after a search, with **X** to go back to your recent lookups.
- Look Up has a pencil and a grid button, always one tap away, for Handwriting and Radicals. Both
  slide up as a sheet you can drag away, and add their pick to the end of what's in the field, so
  you can build a word from both; Handwriting shows bigger candidates with their meanings, and both
  have the same **Undo** button for the last stroke or radical. Radicals' sections open and close.
  Recent lookups no longer sit under a **Recent** heading.
- Player works out how many of a video's words you know more than twice as fast, so **Counting known
  words…** gives way to the percentage sooner on a long video, and a video you go back to while
  Zenbu stays open usually shows it at once. Translate counts a conversation's words the same way.
- Many common compounds now show an estimated pitch accent, and some idioms and 〜的 words no
  longer show one that was wrong.
- Account has a small title at the top, like the other tabs.
- **Licenses** includes Sentry's and ZIPFoundation's license texts.

### Removed

- Image Search no longer opens image files from Files; choose them from your photo library.
- Translate's **Document** no longer reads photos; use **Image**, which also lets you tap words.

### Fixed

- Example sentences appear with their words already linked, with furigana, on Example Sentences,
  a word's Examples, and a conjugated form's examples; a sentence used to be drawn as plain text
  and then redrawn at another height. Long lists show 25 sentences and bring more as you scroll,
  and Example Sentences keeps your place when you come back from a word.
- Example sentences that couldn’t be loaded now say so, with **Retry**; a word's page used to say
  it had no source-matched examples.
- Words written with full-width letters or digits, such as Ｔシャツ, ＣＤプレーヤー, ＳＯＳ, and Ｘ線,
  list their example sentences, in either width (Ｔシャツ and Tシャツ); their pages used to say
  they had none. Numbers such as ３日 also list the sentences that write them full-width.
- **Credits & Attributions** says that Jiten's frequency lists are modified and shared under the
  same license, credits JMdict, KANJIDIC2, and RADKFILE each on its own, and calls three sources by
  their authors' names: Wikipedia Word Frequency Clean, JLPT vocabulary lists, and JLPT kanji lists.
  It reads the same as zenbujapanese.com's Sources page.
- A conversation in Translate keeps following the newest line at larger text sizes, and stops
  only when you scroll up; a tall new line used to stop it and show **Jump to Latest** on its own.
- At larger text sizes, a conversation's controls stay on screen on iPhone, where the pause button
  could be pushed off the edge; press and hold one to see it larger.
- VoiceOver says which kanji is selected when you tap one in a headword to see its furigana.
- Player's **Recent**, word notes, the Media Library, and the profile are no longer written over
  when Zenbu can't read what was saved: a copy is kept on your device, and each keeps everything
  it can read. A photo you delete is still deleted, within 30 days if a kept copy names it.
- A word's notes and photos stay on it when a dictionary update changes the word's meanings; the
  ones you saved before move to the same word the first time Zenbu opens them. A note Zenbu
  can't match to a word is kept under Account → **Notes Without a Word**, to copy or delete.
- In the half-height word sheet in Player, Image Search, and Translate, a word's **Kanji** and its
  part of speech (which opens its conjugations) now open, in the tab you're in.
- Player's search results show only YouTube's results, between Player's own bars: YouTube's
  header, search field, voice search, and bottom bar (Home, Shorts, You) no longer appear.
- When a newer version of Zenbu saved the bookmarks synced to your device, Zenbu Account now says
  to update Zenbu instead of reopening it.
- Frequency Dictionaries: downloading several packs at once no longer looks like each tap cancels
  the one before. Every downloading row keeps its own progress ring, with a stop button.
- Radicals no longer draws over the search results.
- Choosing **Photo Library** for Image Search opens the picker again.
- **Take Photo** opens the camera with its flash off. Turn the flash on, or to automatic, and the
  camera opens with that choice the next time.
- English searches put the common word first: `dog` shows 犬 first and `water` shows 水, where rarer
  words whose meaning was exactly the query used to come ahead of them.
- A profile's username follows the rule your Zenbu account uses: 3 to 30 letters a–z, numbers, or
  underscores. One that doesn't fit now says why and isn't saved, where a period or a one-letter
  name used to be kept and other characters were dropped without a word. A username you already
  saved stays as it is until you change it.
- After many sentences have been linked in one session, a caption card, an example sentence, a
  Translate line, or a line of Image Search's text no longer shows some of its words as plain
  text, with no meaning and nothing to tap.
- A word's pitch accent is its own: 橋, 箸, and 端 now show 2, 1, and 0, where they used to look
  alike. The accent line sits over the morae its reading counts, as in この間.
- 2,526 meanings now carry a **Colloquial** note, and the YouTube list ranks 86 more words, such
  as 家 (いえ).
- Searches with accented letters, such as `café`, list their words, and Example Sentences lists
  their English sentences.
- Romaji searches find words as Zenbu writes them, such as `rāmen`, `kin'en`, and `tsudzuku`, and
  without the macron too.
- A number and its counter link as one word in captions and example sentences: 一人 (ひとり),
  二人 (ふたり), and 十日 (とおか).
- English example search finds a word's other forms: "startled you" finds "startle you".
- Pausing a conversation in Translate mid-sentence no longer closes Zenbu.
- **Sign In** takes a code with spaces around it, or in full-width digits, without using a try.
  A note longer than 10,000 characters stays on your device, and Zenbu Account says so.
- A note or a profile field you're typing in is kept when Zenbu closes. Captions, Image Search's
  lines, Translate's lines, and typed translations appear with their words already linked, without
  jumping.
- VoiceOver skips a conversation's blank rows, reads Player's elapsed and total time, and says its
  position once; the silence prompt and **Video Unavailable** scroll at every text size.
- **No Dictionary Matches** shows only its title.

## Earlier releases

Each has a page of its own: [2.0.0](docs/releases/2-0-0.md), released 2026-10-09, and
[1.0.0](docs/releases/1-0-0.md), released 2026-08-17. When a version is released, the one before
it moves to a page there, named for its version.
