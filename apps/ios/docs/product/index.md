# iOS product documentation

This folder describes user-facing behavior that exists in the Zenbu Japanese iOS app.
It is updated with the implementation and is not a roadmap or an ideas backlog. The one exception
is [Required, not built yet](#required-not-built-yet-563), which lists behavior the owners have
decided the app must have but doesn't yet.

The app runs on iPhone in portrait, on iPad in every orientation and beside other apps, and on
Macs with Apple silicon and macOS 26, as one app with one App Store record
([iPad and Mac](#ipad-and-mac)). It has four tabs:

- **Search** opens the [Dictionary](dictionary.md) Product Experience. Its results can be
  re-sorted by a frequency dictionary or by known words, and filtered to known or unknown words,
  from the **Sorted by** row at their top
  ([Sorting results](dictionary.md#sorting-results),
  [Filtering results](dictionary.md#filtering-results)).
- **Translate** opens [Translate](translate.md), a Japanese and English conversation translator
  that runs on the device, and Image Search, which reads Japanese in a photo
  ([Image Search](translate.md#image-search)).
- **Player** opens [Player](player.md), where a learner watches YouTube
  videos with linked Japanese captions.
- **Account** opens personal content, preferences, language-resource management, support, and credits.

Check: UI `NavigationUITests.testEveryTabOpensItsScreenWithItsMainControlsOnScreen` and
`testTheTabShellListsEveryTabInOrder`; package `AppCommandTests` (the tabs' order, symbols, and
shortcuts).

## How behavior is verified

Each behavior here ends with a **Check** naming the automated tests that prove it. Five kinds run:

- **Package tests** (`apps/ios/Modules/Tests/`), `SearchExperienceTests` and `TranslatorCoreTests`,
  named by type, such as `ResultsScreenTests`. They run on an iPhone Simulator, an iPad
  Simulator, and the Mac, so a package test checks all three.
- **Core tests** (`packages/dictionary-core/src/`), named by file, such as
  `results/ordering.test.ts`. What the dictionary lists, orders, labels, and says is the shared
  core's, which the app runs
  ([`dictionary-core.md`](../../../../docs/agents/dictionary-core.md)), so a core test checks a
  rule for every platform and for the website.
- **UI tests** (`apps/ios/UITests/`), `ZenbuJapaneseUITests`, which drive the built app on the
  same three, named as class and test, such as `SearchUITests.testAQueryWithNoMatchesSaysSo`. They
  use stand-ins only at the edge: an image for the camera, a sheet's answer for Apple's and
  Google's sign-in, the Translate harness's script for the microphone, a local player, fixture
  captions, and a results page for YouTube, and a closed port for the offline account
  ([`ios.md`](../../../../docs/agents/ios.md#tests-on-every-platform)).
- **Contract tests** (`apps/ios/Tools/tests/`), which check the project settings and the bundled
  data, the same for every platform.
- **The recorded-audio check** (`translate-replay`), which plays recorded speech through the real
  recognizers and Apple Translation on a Mac with Apple's speech models
  ([`translate.md`](../../../../docs/agents/translate.md#recorded-audio-check)).

A check covers iPhone, iPad, and the Mac unless it names devices; a behavior that only some
devices have says which. A UI test that checks a device's own side, such as **Take Photo** on
iPhone and iPad and **Paste Image** on the Mac, runs on all three. **By hand** marks what no test
can drive, with the automated check that comes closest: a real Apple or Google sign-in, a real
camera, live speech into a microphone, YouTube's own player and results page, the system's photo
and file pickers, and what iOS or macOS does outside the app (Split View, dragging from another
app, Continuity Camera, opening a link from another app).

## iPad and Mac

Every tab and screen is the same on iPhone, iPad, and Mac, except for what this section lists.
Where these docs say iPhone or phone, the same holds for an iPad or a Mac. Signed in, an iPad or a
Mac syncs through the Zenbu account like another iPhone ([Zenbu account and sync](account-sync.md)),
and messages that name the device say iPad or Mac, such as "Everything stays on this Mac."

- **The tabs.** iPhone has its tab bar. iPad shows the tabs at the top, and they open into a
  sidebar; the Mac shows them in a bar at the top of the window, beside the search field. Each
  tab keeps its own pages on every device. A Mac window opens at 1180 by 820 points, can't be
  made smaller than 760 by 560 below its toolbar, and File → New Window opens another.
  Check: UI `NavigationUITests.testTheTabShellListsEveryTabInOrder`,
  `testOnlyTheIPadOpensItsTabsIntoASidebar`, and
  `testAPageOpensInEveryTabAfterVisitingTheOthers`, `LayoutUITests` (the Mac at its smallest
  window), and on the Mac
  `KeyboardAndWindowUITests.testANewWindowTakesTheShortcutsWhileTheFirstKeepsItsTab`; package
  `AppCommandTests` (window sizes).
- **Menus and keyboard shortcuts**, on the Mac and with a hardware keyboard: **Find in
  Dictionary** (⌘F on the Mac) goes to Search and puts the cursor in its field; on iPad, iPadOS
  keeps ⌘F for its own Find, so Find in Dictionary is in the menu bar without a working shortcut.
  **Search an Image…** (⌘⇧I)
  opens Translate and its **Image** alert, over whatever Translate is showing, and ⌘1 to ⌘4
  switch to Search, Translate, Player, and Account.
  With two windows open, a shortcut acts in the one used last. A website link opens in an open
  window rather than a new one.
  Check: iPad and Mac, UI `KeyboardAndWindowUITests` (⌘1 to ⌘4, ⌘⇧I, and on the Mac ⌘F and a
  second window);
  package `AppCommandTests` (each command's shortcut, and the window it reaches). A link from
  another app is by hand; `WebsiteLinkTests` checks where it goes.
- **Settings on the Mac.** **Zenbu Japanese → Settings…** (⌘,) opens a Settings window with
  the profile and the Zenbu account, Reading Aids, and Frequency Dictionaries. They stay in Account
  too, and both show the same settings; a change to Frequency Dictionaries shows in Search, an
  open word, and the word sheet at once.
  Check: Mac, UI `KeyboardAndWindowUITests.testTheSettingsWindowHoldsTheAccountReadingAidsAndFrequencyDictionaries`;
  package `AppCommandTests` (its panes and size), `UserProfileTests` (a field changed in another
  window), and `FrequencyPackLifecycleTests` and `FrequencyListsTests` (each change published).
- **The word sheet.** A word tapped in Image Search, Player, or Translate opens at half height on
  iPhone. On the Mac it opens as a sheet over the window, so the page behind waits until the sheet
  is closed; on an iPad in full width it opens as a centered sheet. A Mac sheet has no toolbar, so
  there **Close**, which Escape presses, and **Open Full Entry** are buttons along the sheet's
  bottom, and the word's **Share** and **•••** sit in a row above the entry. Return presses
  neither, so a note typed in the sheet keeps the sheet open.
  Check: UI `ImageSearchUITests.testAnImageOpensImageSearchOnTranslateAndAWordOpensItsEntry`
  (where each device places it), `TranslateUITests.testTypedTextIsTranslatedWithItsDirection`
  (its buttons, from a page pushed in the tab),
  `testReturnInAWordSheetsNoteKeepsTheSheetOpen`, and
  `PlayerWatchUITests.testAWordInACaptionOpensItsEntryInsidePlayer`; package
  `WordSheetPresentationTests`.
- **Sheets on the Mac.** Every sheet but Search's input panel and the photo library's own picker
  (720 by 520) opens 480 points wide and 520 tall, plus its row of buttons, which fits the
  smallest window: the word sheet, **Add to List**, a
  frequency rank's details, a frequency dictionary's details, **Stroke Order**, a word's saved
  images, **Sign In**, and **Delete Account**. A Mac sizes a sheet from what's in it, and a page
  that scrolls has no size of its own.
  Check: Mac, UI `WordDetailUITests.testAddToListPutsTheWordInFavoritesAndANewList`,
  `testAFrequencyRankOpensItsDetailsWhichLeadToTheDictionaries`, and
  `testAKanjiShowsItsStrokeOrderAndItsWords`,
  `AccountUITests.testAFrequencyDictionaryShowsItsDetailsAndTurnsOff` and
  `testAUITestBuildWithoutTheStandInSaysAppleIsUnavailable`, and
  `SavedWordsUITests.testAnImagesWordKeepsTheImageInTheMediaLibraryUntilItsDeleted` (each has
  room for its content and stays inside the window); package `AppCommandTests` (the size fits
  the smallest window). **Delete Account** is checked by the same size and the package tests:
  the Mac's signed-in UI tests don't run on a build signed to run locally.
- **Image Search on the Mac.** Translate's **Image** alert offers **Photo Library** and
  **Paste Image**, which takes an image, or up to 8 copied image files, from the clipboard.
  There's no **Take Photo**, here or in a word's **•••** menu: macOS has no camera screen an app
  can show. A photo comes from an iPhone or iPad instead: from any tab, **File → Import from
  iPhone or iPad → Take Photo** (Continuity Camera) opens the photo in Image Search on Translate.
  An image file is pasted or dragged in. Several images are paged by swiping sideways or with the
  dots under them. Image Search's toolbar has the window's Back button as well as its close
  button; either leaves it (`ImageSearchUITests.testClosingImageSearchReturnsToTranslatesHome`).
  Check: UI `TranslateUITests.testImageOffersThisDevicesSources`,
  `WordDetailUITests.testTheMenuOffersThisDevicesActionsAndMarksTheWordKnown` (no **Take Photo**
  on the Mac), and `ImageSearchUITests` (a pasted image on the Mac); package `PlatformAdapterTests`
  (the sources, pasted images and files). Continuity Camera with a real iPhone is by hand; it
  hands over a photo the way **Paste Image** reads one.
- **Dragging images.** On every device, an image dragged onto the window, in any tab, opens it
  in Image Search on Translate, up to 8 at a time, each at most 12 MB, 12,000 pixels on a side,
  and 40 megapixels; a pasted image file has the same limits.
  Check: package `PlatformAdapterTests` (a dropped image's limits). Dragging from another app is
  by hand.
- **Search on iPad and the Mac.** On iPad the tabs and the title bar stay above the search field
  while you type and beside the results, where the iPhone slides its title away, and there's no
  **X**. On the Mac the field sits in the window's toolbar. On both, the field's own clear button
  empties it and returns to Recent. On the Mac, Handwriting and Radicals open as a sheet of a
  fixed size with a **Done** button, which Escape presses too, since a Mac can't drag a sheet
  away.
  Check: iPad and Mac, UI `SearchUITests.testTheTabsStayBesideTheResultsWhichStayAcrossTabs` and
  `testASearchKeepsItsQueryInTheFieldAndRunsAgainFromRecent` (the clear button), and on the Mac
  `SearchInputUITests.testThePencilAndGridOpenOnePanelThatSwitchesBetweenThem` (**Done**);
  package `AppCommandTests` (the sheet's size).
- **Right-click on the Mac.** A row whose actions are behind a swipe on the iPhone also shows
  them on right-click: renaming or deleting a list, removing a word from a list, marking a word
  unknown, removing a video from Recent, updating or removing a frequency dictionary or showing
  its details, and deleting a Media Library image. Search results, recent searches, and
  Translations already open a menu on long-press, which is right-click on the Mac.
  Check: UI `ListsUITests` (renaming and deleting a list), `SavedWordsUITests` (marking a word
  unknown and deleting a Media Library image), and `SearchUITests.testMarkingAResultKnownShowsTheKnownCapsule`,
  each by swipe on iPhone and iPad and right-click on the Mac.
- **Translate on the Mac** uses the Mac's microphone and speakers, and keeps the display awake
  while it listens. Closing the last window pauses a live conversation, as leaving the app does. With two windows on iPad or the Mac, there's one conversation, shown in
  whichever window has Translate open, with the session bar in the others. Without voice isolation (Listening), the Mac assumes its speakers reach the
  microphone, so it stops hearing while a translation plays, even with headphones.
  Check: package `PlatformAdapterTests` (the Mac's speakers reach its microphone),
  `TranslateWindowTests`, and `LiveConversationTests` (Listening on a speaker); UI
  `ConversationUITests.testLeavingTheAppPausesTheConversation` (closing the Mac's window). The
  microphone itself is by hand ([Translate](translate.md#how-translate-is-checked)).
- **Syncing on the Mac** happens while Zenbu is open: when it opens or becomes active, after each
  change, and on **Sync Now**. The Mac has no background refresh, so a closed app doesn't sync.
  Check: package `AccountSyncTests` and `AccountSyncRecoveryTests` (when it syncs).

Also checked by contract `test_app_platforms.py` (the platforms, orientations, sandbox, privacy
strings, entitlements, the Mac icon, and the UI tests' platforms), `pnpm verify layers` (no
iPhone-only API outside the adapters), and UI `LayoutUITests` (every tab fits the iPhone in
portrait, the iPad in both orientations, and the Mac's smallest window). By hand: the iPad beside
another app ([iPad and Mac checks](../../../../docs/agents/ios.md#ipad-and-mac-checks)).

## Furigana kanji highlight

Wherever furigana appears over a run of kanji, a learner can tap one kanji to see which part of
the reading belongs to it: the kanji and its kana turn the accent color (肉 and にく in 弱肉強食).
Tapping it again, or tapping another kanji, moves or clears the highlight. The word keeps its
compact furigana; nothing is spaced apart.

Check: UI `WordDetailUITests.testTappingAKanjiInTheHeadwordHighlightsItsReading`.

The split comes from each kanji's own readings, including the sound changes compounds make
(学校 is がっ・こう, 人々 is ひと・びと), and appears only when those readings split the word's
reading exactly one way. Words read as a whole, such as 大人 (おとな) or 今日 (きょう), have no
per-kanji highlight.

Check: core `detail/kanji-split.test.ts`; package `JapaneseRubyTests` and the recorded
`WordDetailConformanceTests`.

It works on any furigana that isn't itself a tap target: Word Detail and conjugation headwords,
conjugation tables, and Media Library words. Where tapping a word already opens it — Search
results, Known Words and list rows, a kanji's word list, Related Words, and linked words in
sentences and captions — a tap opens the word, whose headword then offers the highlight.

Check: the recorded `WordDetailConformanceTests` (each conjugation's headword split); UI
`SearchUITests.testAnEnglishSearchListsTheWordAndOpensItsDetail` (a result row opens the word).

## Account

Account is a supporting navigation area rather than a separate Product Experience. The tab holds
on-device content and preferences, and signing in to a Zenbu account, which syncs known words,
lists, Player's watch history, Translate's bookmarked sentences, and the profile's name and
username. Like the other tabs, it has a small **Account** title in the bar rather than a large one.
It provides:

- a profile card with the learner's photo, name, and username;
- the Zenbu account: **Sign In to Sync**, or, signed in, **Zenbu Account** with the account's email
  ([Zenbu account and sync](account-sync.md)), against production's account service in
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
- the app's name, version, and description, followed by Help & Support and the Privacy Policy, which
  open the Zenbu website, and **Credits & Attributions**: each source's credit, license, and project
  link, in the shared core's wording ([`data-sources.md`](../../../../docs/data-sources.md)), with
  Jiten's notice that its rankings are adapted and shared alike. **Licenses**, under it, opens each
  bundled license text. If the app can't read the core's list, Credits says so, and Licenses still
  lists every text.

Check: UI `AccountUITests.testAccountListsEveryArea` (every row, and the small title on iPhone and
iPad), `testReadingAidsAndFrequencyDictionariesOpen`,
`testTurningRomajiOnWritesExampleSentencesAndAKanjisReadingsInRomaji` (Romaji on, an example
sentence and a kanji's reading written in it), and `testTranslationsAndCreditsOpenFromAccount` (the
first credit, Jiten's notice, and a license text); contract `test_account_service_settings.py`
(production in TestFlight and App Store builds, staging in Debug); package `PlayerReadingAidTests`
and `WordMeaningTests` (the Reading Aids preferences), `SourceCreditsTests` (the core's credits, and
none it can't read), and the recorded `RomajiConformanceTests` with core `detail/romaji.test.ts`
(how a reading and a sentence are written in romaji).

Rows use Settings-style tinted icon tiles in grouped cards without section headings.

Check: UI `LayoutUITests` (Account's rows on screen at each size).

The profile card opens Profile, where a learner adds or changes a photo and edits their name,
username, and email in place. Each field saves when the learner leaves it. A username follows the
account service's rule: 3 to 30 of `a–z`, digits, and `_`, once NFKC-folded, trimmed, and
lowercased, or empty for none. An email is a single valid address or empty. A username the rule
refuses (a period, a leading `@`, kana) or an invalid email shows why and isn't saved; a username an
earlier version saved stays as it was until it is edited. Without a photo, the card shows the name's
initials. Signed in, name and username sync with the Zenbu account: each sign-in keeps the
account's, filling its empty ones from the phone ([The profile at sign-in](account-sync.md)). Email
shows the account's, read-only (Apple's relay address for Hide My Email), the name can't be emptied,
and a change the account refuses, such as a taken username, goes back and says why. Signed out,
edits stay on the phone, and the photo always does. One this version can't read is kept aside
([Saved data that can't be read](#saved-data-that-cant-be-read)).

Check: package `UserProfileTests` (the field rules, the username's from the cases the account
service's tests share, `apps/account-api/src/domain/username-cases.json`; saving on leaving; a
reload; an earlier username kept; an unreadable profile; the first sync), `AccountSyncProfileTests`,
`PlatformAdapterTests` (the photo); UI `AccountUITests.testTheProfileKeepsANameAndShowsItOnTheCard`
(the card, and both fields' errors) and `AccountSignedInUITests` (signed in).

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

Check: package `FrequencyPackLifecycleTests`, `SearchResultOrderingTests`, and `ResultsScreenTests`;
core `detail/frequency.test.ts`; contract `test_frequency_pack_runtime_contract.py` (each pack's
pinned source, ranks, and the YouTube spellings); UI
`AccountUITests.testReadingAidsAndFrequencyDictionariesOpen` (a row for every pack, and a download
for each of the seven optional ones). Downloading an optional pack needs the network: by hand, with
`FrequencyPackLifecycleTests` installing one from a local file.

The screen lists one row per pack in three sections. **Enabled** holds packs that are
switched on, in priority order; Edit reorders them (on the Mac, they're dragged directly). Ranks appear in this order, and Search
sorts by the first pack, breaking ties with each next pack, unless the learner sorts by one pack
from Search's **Sorted by** row ([Sorting results](dictionary.md#sorting-results)). A word the first pack doesn't rank
places by how common the next pack that ranks it says it is (家, which YouTube doesn't rank, places
by its JLPT N5 level), rather than after every ranked word. **Installed** holds downloaded packs that are switched off, and
**Available** offers a download button for each remaining pack. Several packs can download at
once: each row shows its own progress ring with a stop button, and stopping one leaves the others
running and its row ready to download again. When its download finishes, a row shows a spinner
while the pack is installed, one pack at a time, and can no longer be stopped; a new pack then
moves to **Enabled**. Remove and Update are hidden on a row while it downloads. A row's subtitle shows its
domain and size, or a download failure. Swiping a row reveals Details and Remove, and Update
when a newer version exists. When the app upgrades from the single active pack, that pack
becomes the only enabled one. An update that adds a bundled pack, such as JLPT Levels, enables
it once at the top of the learner's list; disabling it afterward is remembered.

Check: package `FrequencyPackLifecycleTests` (enabling, ordering, disabling, removing, and the
upgrades), `FrequencyPackDownloadsTests` (several downloads side by side, stopping one, and a stop
not counted as a failure), and `SearchResultOrderingTests` (a word the first pack doesn't rank); UI
`AccountUITests.testAFrequencyDictionaryShowsItsDetailsAndTurnsOff` (a row's Details, by swipe or
right-click, and its switch). A real download needs the network: by hand
([Search manual checks](../../../../docs/agents/ios.md#search-manual-checks)).

### Known Words

Known Words shows its count on the Account row and lists every word and kanji the learner marked
known, most recent first. A learner can search the list by headword or reading, swipe an item to
mark it unknown, or open its word or kanji page in Search. A word whose entry ID changed opens the entry with the
same headword and reading, and a search for the headword only when there is none.
Known words are stored on the device, and sync through the Zenbu account while the learner is
signed in ([Zenbu account and sync](account-sync.md)). If the saved known words
came from a newer version of Zenbu, or a damaged file couldn't be kept aside, they are shown but
can't be changed, and Known Words and the Mark as Known button say so. If the file exists but
can't be read at launch, such as before the device's first unlock, nothing is shown or saved over
it, and Known Words asks the learner to reopen Zenbu.

Check: package `WordKnowledgeTests`, `SavedKanjiTests`, and `WordResolutionTests` (the entry a saved
word opens); UI `SavedWordsUITests.testAKnownWordIsListedAndCanBeMarkedUnknownThere`,
`WordDetailUITests.testTheMenuOffersThisDevicesActionsAndMarksTheWordKnown`, and
`AccountUITests.testKnownWordsAndTheMediaLibraryStartEmptyAndListsStartWithFavorites` (empty).

### Lists

Lists are the learner's own named groups of dictionary words and kanji, such as "Favorites" or
"Anime S1 vocab". A new install starts with one list, **Favorites**, which can be renamed or deleted
like any other; once deleted it is not created again. Signed in, Favorites is one list on every
device and Zenbu app ([Zenbu account and sync](account-sync.md)). Words and kanji are added
from their page's **•••** menu (see [Dictionary](dictionary.md)).

The Account row shows how many lists there are. Lists shows every list in the learner's order
with its word count; two lists in one place, as after signing in on a second phone, show in the
same order on every device. A learner can create a list, swipe a list to rename or delete it (a list
that has words asks first), and open a list. In Edit, the learner drags lists to reorder them and
taps a list to rename it; the Mac has no Edit, and its lists are dragged into order directly. Names are trimmed, can't be
empty, hold at most 500 characters (control characters become spaces), and may repeat. A list shows its words most recently added first, with the **✓ Known** capsule on known words; the learner can search
it by headword or reading, swipe a word to remove it from that list, or open its word page, found
the same way as in Known Words. Its **•••** menu renames the
list, deletes it (asking first when it has words), or selects words: while selecting, the top bar
offers Select All, Remove, and Done. Deleting a list removes its words from that list only.

Check: package `WordListsTests` and `SavedKanjiTests`; UI `ListsUITests` (making, renaming,
deleting, and dragging a list into order) and `AccountUITests.testKnownWordsAndTheMediaLibraryStartEmptyAndListsStartWithFavorites`
(Favorites at first).

A word's page also names the lists holding it; tapping one opens that list here.

Check: UI `WordDetailUITests.testAddToListPutsTheWordInFavoritesAndANewList`.

Lists are stored on the device, keyed by each entry's stable identifier, and sync through the Zenbu
account while the learner is signed in. Like Known Words,
lists saved by a newer version of Zenbu, or a damaged file that couldn't be kept aside, are shown
but can't be changed, and Lists and the list picker say so. A lists file that can't be read at
launch is left untouched, Favorites is not created over it, and Lists asks the learner to reopen
Zenbu.

Check: package `WordListsTests` (newer, damaged, and unreadable files).

### Media Library

The current Media Library works like a small saved-photo album. It contains images associated
with words through Image Search or Word Detail. Each image appears once with all of its
associated words, even when several words share it. A learner can view an image, remove its
association from one word, or delete the image and all of its word associations.

Check: UI `SavedWordsUITests.testAnImagesWordKeepsTheImageInTheMediaLibraryUntilItsDeleted` and
`AccountUITests` (empty at first); package `EncounterMediaStorageTests`.

These images are stored locally and participate in normal system-managed device backup. The
Media Library is not currently a general file store, import system, analysis tool, sync service,
or publishing destination.

Deleting a photo, or removing it from its last word, deletes its image at once, unless a copy of
the index kept aside (below) names the photo, or one can't be read. Then the image goes later,
checked at most once a day as Zenbu opens or comes back, or as a word's photos or the Media
Library load: once no kept copy names it, and once 30
days have passed since it was deleted even if one still does; while a kept copy can't be read,
such as before the device's first unlock, it waits.
If Zenbu can't record the deletion, as on a full device, that image stays. Zenbu deletes an image
only after the learner deletes its photo, or removes the photo from the last word the Media
Library shows it with.

Check: package `DeferredImageDeletionsTests` and `EncounterMediaStorageTests`.

### Saved data that can't be read

Player's Recent, word notes, the Media Library's index, and the profile keep what a learner saved
when this version of Zenbu can't read it, as Known Words and Lists do: the saved data is copied
aside on the device (the newest three copies of each are kept) rather than written over, each
keeps every video, note, or photo it can read, and new changes save as before. A profile that
can't be read starts empty. If the Media Library's index can't be opened or copied aside, the
Media Library shows nothing and saves nothing until it can, rather than write over it.

Check: package `UnreadableCopyTests`, `WordNoteStorageTests`, `UserProfileTests`,
`EncounterMediaStorageTests`, and `AccountSyncWatchHistoryTests`.

### Zenbu account and sync

Signing in to a Zenbu account, what syncs and what doesn't, and deleting the account are in
[Zenbu account and sync](account-sync.md).

## Required, not built yet (#563)

Behavior the owners have decided the app must have, but which isn't built yet. When one is built,
it moves into its section above in the same PR.

### Known across apps

Decided on 2026-10-06 ([#563](https://github.com/serpcompany/zenbujapanese-monorepo/issues/563),
decision 4). This app's side is built: it syncs Known marks through the account, and takes a mark
made in another app, as [Zenbu account and sync](account-sync.md) says. Once a learner is
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
