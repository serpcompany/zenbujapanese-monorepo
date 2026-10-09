# iOS product documentation

This folder describes user-facing behavior that exists in the Zenbu Japanese iOS app.
It is updated with the implementation and is not a roadmap or an ideas backlog. The one exception
is [Required, not built yet](#required-not-built-yet-563), which lists behavior the owners have
decided the app must have but doesn't yet.

The app runs in portrait on iPhone. It has four tabs:

- **Search** opens the [Dictionary](dictionary.md) Product Experience. Its results can be
  re-sorted by a frequency dictionary or by known words, and filtered to known or unknown words
  and to the words one dictionary ranks, from the **Sorted by** row at their top
  ([Sorting results](dictionary.md#sorting-results),
  [Filtering results](dictionary.md#filtering-results)).
- **Translate** opens [Translate](translate.md), a Japanese and English conversation translator
  that runs on the iPhone, and Image Search, which reads Japanese in a photo
  ([Image Search](translate.md#image-search)).
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

Account is a supporting navigation area rather than a separate Product Experience. The tab holds
on-device content and preferences, and signing in to a Zenbu account, which syncs known words,
lists, Player's watch history, and Translate's bookmarked sentences. It provides:

- a profile card with the learner's photo, name, and username;
- the Zenbu account: **Sign In to Sync**, or, signed in, **Zenbu Account** with the account's email
  ([Zenbu account and sync](#zenbu-account-and-sync)), against production's account service in
  TestFlight and App Store builds and staging's in Debug builds;
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
profile is stored only on the device and is not synced to the Zenbu account.

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
sorts by the first pack, breaking ties with each next pack, unless the learner sorts by one pack
from Search's **Sorted by** row ([Sorting results](dictionary.md#sorting-results)). A word the first pack doesn't rank
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
Known words are stored on the device, and sync through the Zenbu account while the learner is
signed in ([Zenbu account and sync](#zenbu-account-and-sync)). If the saved known words
came from a newer version of Zenbu, or a damaged file couldn't be kept aside, they are shown but
can't be changed, and Known Words and the Mark as Known button say so. If the file exists but
can't be read at launch, such as before the device's first unlock, nothing is shown or saved over
it, and Known Words asks the learner to reopen Zenbu.

### Lists

Lists are the learner's own named groups of dictionary words and kanji, such as "Favorites" or
"Anime S1 vocab". A new install starts with one list, **Favorites**, which can be renamed or deleted like
any other; once deleted it is not created again. Signed in, Favorites is one list on every device
and Zenbu app ([Zenbu account and sync](#zenbu-account-and-sync)). Words and kanji are added from their page's **•••** menu
(see [Dictionary](dictionary.md)).

The Account row shows how many lists there are. Lists shows every list in the learner's order
with its word count; two lists in one place, as after signing in on a second phone, show in the
same order on every device. A learner can create a list, swipe a list to rename or delete it (a list
that has words asks first), and open a list. In Edit, the learner drags lists to reorder them and
taps a list to rename it. Names are trimmed, can't be
empty, hold at most 500 characters (control characters become spaces), and may repeat. A list shows its words most recently added first, with the **✓ Known** capsule on known words; the learner can search
it by headword or reading, swipe a word to remove it from that list, or open its word page, found
the same way as in Known Words. Its **•••** menu renames the
list, deletes it (asking first when it has words), or selects words: while selecting, the top bar
offers Select All, Remove, and Done. Deleting a list removes its words from that list only.

A word's page also names the lists holding it; tapping one opens that list here.

Lists are stored on the device, keyed by each entry's stable identifier, and sync through the Zenbu
account while the learner is signed in. Like Known Words,
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

### Zenbu account and sync

A learner can sign in to their Zenbu account from Account, to keep their known words and lists the
same on every device and Zenbu app they sign in to (#573), and Player's Recent videos and
Translate's bookmarked sentences the same on every device running this app
([Player](player.md#opening-a-video), [Translate](translate.md#translations)). Zenbu works the same signed
out and offline: everything stays on the phone, and the phone's copy is what the app shows.

What doesn't sync, and why:

- **Word notes**, until they're keyed by Language Reference ID (#474, PR #480): they're keyed by a
  hash of a word's meanings, which changes when the dictionary does, and the notes the app has
  already saved need moving to the new key first.
- **Media Library photos**, which need file storage the account service doesn't have.
- **Translate conversations**, which hold other people's words: only the sentences the learner
  bookmarks sync, each on its own.
- **Settings**, such as Reading Aids, which stay with each device.
- **The profile on Account**, which is this phone's own.

**Signing in.** **Sign In to Sync** opens a sheet with **Sign in with Apple**, **Sign in with
Google** (in builds given a Google client ID, which every build is), and an emailed code: the learner enters their
email, taps **Email Me a Code**, and enters the 6-digit code. A refused sign-in says why, such as a
wrong or expired code, or an email whose account signs in with Apple or Google. Sign in with Apple
asks for the learner's name and email; a new account takes the name Apple shares on the first
sign-in, which the website's account page shows and lets the learner change. Signed in, the
Account row shows **Zenbu Account** and the email.

**The first sync.** When this phone signs in to an account other than the one it last signed out
of, the app sends the account everything on the phone: every known word, every list, every list's
words, Recent's videos, and bookmarked sentences, then brings down everything the account already
has. A phone that signed in before the app synced watch history or bookmarks sends them once, after
updating. The same Apple ID, Google account, or email reaches the same
account in every app.

**Favorites is one list.** Every device's and app's Favorites is the same list in the account, so
signing in on a second phone puts that phone's Favorites words into the account's Favorites, under
its name and place, rather than making a second Favorites. An install that already had Favorites
before it could sign in joins it the same way, if its oldest list is still named Favorites. If
Favorites was deleted in the account, a phone signing in keeps its own Favorites, with its words,
as a new list.

**When it syncs.** After each change to a known word, a list, Recent, or a bookmark, when the app opens or returns to
the foreground with changes waiting or a last sync over 15 minutes ago, when iOS gives it time in
the background, and when the learner taps **Sync Now** on Zenbu Account. Never on a timer. Offline,
changes wait on the phone, in order, across relaunches, and go when it's back; a failed sync tries
again a few times, waiting longer each time, only while the app is open.

**When the same thing changed elsewhere.** Each kind of change follows the account's rule
([`docs/agents/account-clients.md`](../../../../docs/agents/account-clients.md), The rules):

- A known word marked or un-marked on another device first shows as it is there, for the learner
  to change again: an un-mark made before this phone saw a newer mark shows the word Known again.
- A list renamed or moved elsewhere first keeps the other name or place.
- A list deleted anywhere is deleted here with its words, whatever was done to it since. The one
  exception is Favorites on a phone signing in to an account whose Favorites was deleted before
  (above).
- A word added to a list elsewhere stays, even if this phone removed it without seeing that add.
- A change the account can never take, such as a word added to a list deleted elsewhere, is undone
  on the phone.
- A video watched on two devices keeps the place from the device that watched it last, by each
  device's clock, even when the other syncs later. A
  video removed from Recent on one device is removed everywhere, even if another device, which
  hadn't heard of the removal, updated its place since; watching it again brings it back.
- The account keeps the 50 most recently watched videos, as Recent does; a video watched on
  another device that pushes one past 50 removes it here too.
- A sentence un-bookmarked on one device is un-bookmarked everywhere, unless another device
  bookmarked it again since without this one hearing; then it stays bookmarked. The account holds
  at most 2,000 bookmarks; past that, a new bookmark is taken back off, and bookmarks a first sync
  can't fit stay on the phone without syncing.

**Zenbu Account** shows the email, when the last sync was (or that one is running), how many
changes are waiting, and a note when the last sync failed, with **Sync Now**, **Sign Out**, and
**Delete Account…**. If the bookmarks synced from other devices can't be read at launch, such as
before the device's first unlock, nothing syncs until Zenbu is reopened, so none are lost, and
Zenbu Account says so.

**Signing out** asks first, then forgets the sign-in on this phone and keeps everything: known
words, lists, Recent, Translations, notes, and media stay, and every feature works. Changes made while signed out, such
as an un-marked word, a deleted list, a removed word, or a rename, are kept in order (each word,
list word, and list as just its latest change), and go to the account when the learner signs in to
the same account again, by the account's rules: a change made elsewhere first wins. Signing in to a different account instead sends that account everything on the phone, as
a first sync does. If the account ends the session itself, such as after the account is deleted
from another app, the app signs out the same way, and the Account row says so.

### Deleting the account

A signed-in learner can delete their Zenbu account from **Zenbu Account → Delete Account…**
(#574, App Review guideline 5.1.1(v)):

- The sheet says what goes (the account, its ways to sign in, and everything it synced, on every
  device and app) and that this phone keeps its data. **Delete Account…** asks to confirm.
- The learner signs in again: with **Sign in with Apple** if the account uses Apple, otherwise with
  Google or an emailed code to the account's email. Signing in to a different account deletes
  nothing. A development build (Zenbu Dev) can't sign in with Apple, so for an account that uses
  Apple it says to delete it from the App Store or TestFlight app.
- The account and everything it synced are then deleted through the account service
  ([`docs/agents/account-clients.md`](../../../../docs/agents/account-clients.md), Deleting the
  account). If Apple refuses or doesn't answer, nothing is deleted, and the learner signs in with
  Apple again to try again.
- Afterwards the app is signed out and keeps everything on the phone: Known Words, lists,
  Recent, Translations and their bookmarks, notes, and media stay, and every feature works. Signing in again makes a new account, which gets
  everything on the phone, as a first sync does.

## Required, not built yet (#563)

Behavior the owners have decided the app must have, but which isn't built yet. When one is built,
it moves into its section above in the same PR.

### Known across apps

Decided on 2026-10-06 ([#563](https://github.com/serpcompany/zenbujapanese-monorepo/issues/563),
decision 4). This app's side is built: it syncs Known marks through the account, and takes a mark
made in another app, as [Zenbu account and sync](#zenbu-account-and-sync) says. Once a learner is
signed in to the same Zenbu account in this app and in Tomodachi:

- The first time a word reaches Tomo's "knows it" stage, Tomodachi marks it Known. After the app
  syncs, it shows in Known Words, with the **✓ Known** capsule wherever the word appears.
- Tomodachi never un-marks a word; only the learner does.
- Words Known in Zenbu aren't introduced to Tomo as new, though Tomo can still review them.
- After the learner un-marks a word, Tomodachi marks it again only once the word climbs back to
  "knows it".
- If the learner and Tomodachi change the same word before both have synced, the change made
  after seeing the other wins: a mark Tomodachi made before it saw the learner's un-mark is
  dropped, and an un-mark made before this device saw a newer mark shows the word Known again,
  for the learner to un-mark again. The account service holds this rule (#572).

Still to build: Tomodachi recording when a word first reaches "knows it", and marking it, in its
own repository.
