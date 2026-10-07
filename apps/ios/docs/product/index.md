# iOS product documentation

This folder describes user-facing behavior that exists in the Zenbu Japanese iOS app.
It is updated with the implementation and is not a roadmap or an ideas backlog. The one exception
is [Required, not built yet](#required-not-built-yet-563), which lists behavior the owners have
decided the app must have but doesn't yet.

The app runs in portrait on iPhone. It has four tabs:

- **Search** opens the [Dictionary](dictionary.md) Product Experience.
- **Translate** opens [Translate](translate.md), a Japanese and English conversation translator
  that runs on the iPhone.
- **Player** opens [Player](player.md), where a learner watches YouTube
  videos with linked Japanese captions.
- **Account** opens personal content, preferences, language-resource management, support, and credits.

## Furigana kanji highlight

Wherever furigana appears over a run of kanji, a learner can tap one kanji to see which part of
the reading belongs to it: the kanji and its kana turn the accent color (肉 and にく in 弱肉強食).
Tapping it again, or tapping another kanji, moves or clears the highlight. The word keeps its
compact furigana; nothing is spaced apart.

The split comes from each kanji's own readings, including the sound changes compounds make
(学校 is がっ・こう, 人々 is ひと・びと), and appears only when those readings split the word's
reading exactly one way. Words read as a whole, such as 大人 (おとな) or 今日 (きょう), have no
per-kanji highlight.

It works on any furigana that isn't itself a tap target: Word Detail and conjugation headwords,
conjugation tables, and Media Library words. Where tapping a word already opens it — Search
results, Known Words and list rows, a kanji's word list, Related Words, and linked words in
sentences and captions — a tap opens the word, whose headword then offers the highlight.

## Account

Account is a supporting navigation area rather than a separate Product Experience. There is no
sign-in yet; the tab holds on-device content and preferences. It provides:

- a profile card with the learner's photo, name, and username;
- the Media Library;
- Known Words;
- Lists;
- **Translations**, with how many conversations Translate has saved, which opens the same
  **Translations** screen as the Translate tab;
- Reading Aids: Furigana, Romaji, and Hide Furigana on Known Words; Word Meanings (a short
  meaning under each linked word the learner hasn't marked known); and Sentence Translations,
  with a translation language (English so far) and who translates Player captions — YouTube, or
  Apple Translation on the device, which Reading Aids offers to download;
- management of optional frequency dictionaries; and
- the app's name, version, and description, followed by Help & Support and the Privacy Policy,
  which open the Zenbu website, and source credits and attributions.

Rows use Settings-style tinted icon tiles in grouped cards without section headings.

The profile card opens Profile, where a learner adds or changes a photo and edits their name,
username, and email in place. Each field saves when the learner leaves it. A username keeps only
lowercase `a–z`, digits, `_`, and `.`, drops a leading `@`, and is capped at 30 characters; names
in any script belong in the name. An email must be a single valid address or empty; an invalid
one shows an error and is not saved. Without a photo, the card shows the name's initials. The
profile is stored only on the device and is not linked to any account.

Frequency Dictionaries includes JLPT Levels and YouTube (TUBELEX) in the app and offers
seven optional packs: Japanese Wikipedia, plus TV & Movies, Anime, Manga, Novels, Visual Novels,
and Video Games built from Jiten's CC BY-SA 4.0 lists. Every pack's source is openly licensed.
Optional packs are downloaded on request and mapped locally into Zenbu's dictionary; Jiten packs
match words by reading as well as spelling. YouTube counts words by spelling, so a spelling
shared by several dictionary words (時 is とき and じ) ranks the one UniDic's reading for it
names (とき); a spelling UniDic also reads several ways, such as 家 (いえ, うち), has no YouTube
rank. A pack removed from the catalog in an update is
deleted from the device on the next launch. A learner can enable any number of installed packs,
including none. A newly downloaded pack is enabled automatically. JLPT Levels and YouTube can
be disabled but not removed, and removing an optional pack also disables it. A new install
enables JLPT Levels first and YouTube second. JLPT Levels marks words with an estimated N5–N1
level from Jonathan Waller's lists; JLPT publishes no official vocabulary list, so the app
presents levels as unofficial study estimates.

The screen lists one row per pack in three sections. **Enabled** holds packs that are
switched on, in priority order; Edit reorders them. Ranks appear in this order, and Search
sorts by the first pack, breaking ties with each next pack. A word the first pack doesn't rank
places by how common the next pack that ranks it says it is (家, which YouTube doesn't rank, places
by its JLPT N5 level), rather than after every ranked word. **Installed** holds downloaded packs that are switched off, and
**Available** offers a download button for each remaining pack. A row's subtitle shows its
domain and size, or a download failure. Swiping a row reveals Details and Remove, and Update
when a newer version exists. When the app upgrades from the single active pack, that pack
becomes the only enabled one. An update that adds a bundled pack, such as JLPT Levels, enables
it once at the top of the learner's list; disabling it afterward is remembered.

### Known Words

Known Words shows its count on the Account row and lists every word and kanji the learner marked
known, most recent first. A learner can search the list by headword or reading, swipe an item to
mark it unknown, or open its word or kanji page in Search. A word whose entry ID changed opens the entry with the
same headword and reading, and a search for the headword only when there is none.
Known words are stored only on the device; Known across apps is decided but not built
([Required, not built yet](#required-not-built-yet-563)). If the saved known words
came from a newer version of Zenbu, or a damaged file couldn't be kept aside, they are shown but
can't be changed, and Known Words and the Mark as Known button say so. If the file exists but
can't be read at launch, such as before the device's first unlock, nothing is shown or saved over
it, and Known Words asks the learner to reopen Zenbu.

### Lists

Lists are the learner's own named groups of dictionary words and kanji, such as "Favorites" or
"Anime S1 vocab". A new install starts with one list, **Favorites**, which can be renamed or deleted like
any other; once deleted it is not created again. Words and kanji are added from their page's **•••** menu
(see [Dictionary](dictionary.md)).

The Account row shows how many lists there are. Lists shows every list in the learner's order
with its word count. A learner can create a list, swipe a list to rename or delete it (a list
that has words asks first), and open a list. In Edit, the learner drags lists to reorder them and
taps a list to rename it. Names are trimmed, can't be
empty, and may repeat. A list shows its words most recently added first, with the **✓ Known** capsule on known words; the learner can search
it by headword or reading, swipe a word to remove it from that list, or open its word page, found
the same way as in Known Words. Its **•••** menu renames the
list, deletes it (asking first when it has words), or selects words: while selecting, the top bar
offers Select All, Remove, and Done. Deleting a list removes its words from that list only.

A word's page also names the lists holding it; tapping one opens that list here.

Lists are stored only on the device, keyed by each entry's stable identifier. Like Known Words,
lists saved by a newer version of Zenbu, or a damaged file that couldn't be kept aside, are shown
but can't be changed, and Lists and the list picker say so. A lists file that can't be read at
launch is left untouched, Favorites is not created over it, and Lists asks the learner to reopen
Zenbu.

### Media Library

The current Media Library works like a small saved-photo album. It contains images associated
with words through Image Search or Word Detail. Each image appears once with all of its
associated words, even when several words share it. A learner can view an image, remove its
association from one word, or delete the image and all of its word associations.

These images are stored locally and participate in normal system-managed device backup. The
Media Library is not currently a general file store, import system, analysis tool, sync service,
or publishing destination.

## Required, not built yet (#563)

Behavior the owners have decided the app must have, but which isn't built yet. When one is built,
it moves into its section above in the same PR.

### Known across apps

Decided on 2026-10-06 ([#563](https://github.com/serpcompany/zenbujapanese-monorepo/issues/563),
decision 4). Once a learner is signed in to the same Zenbu account in this app and in Tomodachi:

- The first time a word reaches Tomo's "knows it" stage, Tomodachi marks it Known. After the app
  syncs, it shows in Known Words, with the **✓ Known** capsule wherever the word appears.
- Tomodachi never un-marks a word; only the learner does.
- Words Known in Zenbu aren't introduced to Tomo as new, though Tomo can still review them.
- After the learner un-marks a word, Tomodachi marks it again only once the word climbs back to
  "knows it".

Built by:

- the account service and its sync API (#565, #566, #567);
- Tomodachi's access to the account, including its mark-Known scope (#570);
- syncing Known words through the account (#572);
- sign-in and sync in this app (#573);
- Tomodachi recording when a word first reaches "knows it", in its own repository.
