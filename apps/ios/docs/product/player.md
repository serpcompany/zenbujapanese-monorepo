# Player

Player is the app's third tab. A learner watches a YouTube video with its Japanese
captions listed below the player as caption cards, and looks up any captioned word with the same
dictionary sheet Image Search uses.

## Opening a video

- The tab has a search bar like a browser's address bar, with the prompt **Search YouTube or paste a
  link** (**Search** at the largest text sizes, as Look Up's is **Look Up**). Pasting a YouTube link
  (`watch?v=`, `youtu.be/`, `shorts/`, `embed/`, or `live/`) opens the video directly. Anything else searches
  YouTube and shows its results in the app; choosing a video from them opens it in Player. The
  results are YouTube's mobile results page on every device, without YouTube's own header (its
  search field and voice search) or its bottom bar (Home, Shorts, You). The app's navigation bar,
  with Back and the query, and its tabs are the only controls, and the last result scrolls clear
  of the tab bar. Search in Player is always YouTube's: the root view gives Player its provider
  (`searchProvider: .youTube` in `SearchExperienceRootView.swift`), and no screen offers Google
  Videos, the other provider `VideoSearch.swift` can build. Its results page was checked for
  #753's problem only that far: it isn't reachable, so it has no style hiding Google's own header
  and bars, and it needs one before any screen offers it
  ([tech debt](../../../../docs/tech-debt.md)).
  Check: package `YouTubeCaptionsTests` (which text is a video link, in every form, and each
  search provider's results page and the videos chosen from it); UI `PlayerUITests` (the search
  bar), `PlayerWatchUITests` (a pasted link opens the video, with YouTube stood in), and
  `PlayerWatchUITests.testASearchShowsYouTubesResultsWithoutYouTubesOwnBars` (a stand-in page laid
  out like YouTube's results: its bars hidden with no gap left for them, the last result clear of
  the tab bar, and a result opening in Player). YouTube's live results page is by hand
  ([Player manual checks](../../../../docs/agents/ios.md#player-manual-checks)).
- A link in Zenbu's own scheme, `com.zenbujapanese.dictionary://watch?v=` and a video's ID, opens
  that video from any tab, as pasting its link does, with Player's home under it; Back returns to
  the home. An open word sheet closes, and a running Translate conversation keeps going. A link
  without a video ID, or with text that isn't one, opens Player's home
  ([Links in Zenbu's own scheme](shortcuts.md#links-in-zenbus-own-scheme)).
  Check: package `AppLinkTests.watchLinks`; UI
  `AppLinkUITests.testWatchOpensItsVideoFromAConversationAWordSheetAndLookUp`, with YouTube stood
  in.
- Below the bar, the tab lists recently watched videos, newest first, each as its own
  full-width card: the thumbnail with a comprehension pill (red under 25%, orange to 50%, yellow
  to 75%, green from 75%), its length, and a red bar for how far the learner watched, then the
  title and channel. Swiping a card reveals **Remove**. With no videos yet, the tab explains what it
  does.
  Check: UI `PlayerUITests.testPlayerExplainsItselfWithNoVideosAndOffersItsSearchBar` (with no
  videos) and `PlayerWatchUITests.testAWatchedVideoIsListedInRecentAndCanBeRemoved` (by swipe on
  iPhone and iPad, right-click on the Mac); package `AccountSyncWatchHistoryTests` (Recent's order
  and the comprehension it keeps).
- Recently watched videos are stored on the device, the 50 most recently watched. While the
  learner is signed in to their Zenbu account, Recent is the same on every device signed in to it
  ([Zenbu account and sync](account-sync.md)): a video watched on one appears on
  the others in its place by when it was watched, with how far the learner got and its
  comprehension, and one removed on one is removed on all. Only this app syncs it; the website
  and other Zenbu apps don't see it. If a saved video can't be read, Recent keeps a copy of what
  was saved on the device rather than writing over it, keeps every video it can read, and keeps
  syncing ([Saved data that can't be read](saved-data.md#saved-data-that-cant-be-read)).
  Check: package `AccountSyncWatchHistoryTests` (the 50, sync, and an unreadable Recent).

## Watching

The video plays in YouTube's embedded player at the top of the screen, and the tab bar stays
visible. The navigation bar reads **Player**, with a **•••** menu of the
[**Show**](reading-aids.md#the-show-menus) switches, Furigana, Furigana on Known Words, Word
Meanings, and Translations, then **Share Video**. Between the
controls and the caption cards, a fixed line with a divider below it reports how many of the
captions' words the learner knows: the percentage, colored like the Recent pill, then the counts,
such as **73%** 38 of 52 words known. If the video's owner doesn't allow other apps to play it,
the player shows **Video Unavailable**.

Check: UI `PlayerWatchUITests.testAVideoListsItsCaptionCardsWithTheShareOfWordsKnown`,
`testTheMenuHidesAndShowsACaptionsTranslation`, and
`testAVideoItsOwnerWontShareSaysItsUnavailable`; package `PlayerReadingAidTests` (comprehension and
the reading aids' switches) and `YouTubeCaptionsTests` (an unplayable video). YouTube's real
player is by hand; the UI tests stand in for it with a local player that answers the same calls.

- **No caption overlay.** The player doesn't draw YouTube's own captions over the video; the
  caption cards below replace them.
- **Player's own controls.** YouTube's seek bar, captions, settings, and fullscreen buttons are
  hidden, and tapping the video plays or pauses it. YouTube still shows its title, share button,
  and logo when a video starts, buffers, or is paused.
- **Caption cards follow the video.** Below the player, the video's Japanese captions appear as
  one card per line, each with its words already linked, at the height it keeps: the cards that fit
  the screen appear together, and the rest join the end of the list as they're linked, so a card
  never changes height as its words link, nor when it scrolls back into view. The card for the line
  being spoken gets a tinted fill and an accent-colored
  outline, and is scrolled to the center as the video plays. One line is always highlighted:
  between lines, the last spoken line stays highlighted, and before the first line starts, the
  first line is.
  Check: UI `PlayerWatchUITests.testAVideoListsItsCaptionCardsWithTheShareOfWordsKnown` and
  `LinkedRowsUITests.testACaptionArrivesLinkedAndIsStillLinkedWhenItScrollsBack` (linking held,
  a card is never listed unlinked, and comes back linked at its height); package
  `YouTubeCaptionsTests` (cues from timed text, without overlaps) and `LinkedRowsTests` (the cards
  that fit first, then 25 at a time, each linked once).
- **Tapping a card jumps to it.** Tapping a card anywhere outside its words plays the video from
  the start of that line. Each card shows its time range, small, in its top corner.
- **Words link to the dictionary.** Each card shows the line as linked Japanese text that
  follows the learner's Furigana, Romaji, and Word Meanings preferences. Words the learner marked
  known have no underline or meaning, so unknown words stand out; they can still be tapped. Tapping a word pauses
  the video and opens its Word Detail in a sheet at half height, below the video. A word with
  several possible entries, such as で, opens the same sheet listing them to choose from. The
  video and controls stay usable; the sheet can be pulled up to full height. **Open Full
  Entry**, the expand button beside the word, and the sheet's links to other dictionary pages (a
  kanji, the conjugations, a related word, or a word in an example) close the sheet and open the
  page inside Player, so Back returns to the video. The same goes for the word sheet in Translate
  and in its Image Search, which open the page inside Translate. A card's words keep their links
  however many lines were linked before it. A number and its counter are one word where one
  dictionary entry has both, read as it: 一人 ひとり, 二人 ふたり, 二十日 はつか (core
  `packages/dictionary-core/src/examples/linking.test.ts`, "a number and its counter").
  Check: UI `PlayerWatchUITests.testAWordInACaptionOpensItsEntryInsidePlayer` and
  `testAWordSheetsKanjiOpensItsPageInsidePlayer`; the same sheet in Image Search
  (`ImageSearchUITests.testAWordSheetsKanjiOpensItsPageOnTranslate`) and Translate
  (`ConversationUITests.testAWordsFullEntryShowsTheSessionBarThatReturns` and
  `testAWordSheetsConjugationsAndKanjiOpenTheirPagesInTranslate`); package
  `WordSheetPresentationTests`, `PlayerReadingAidTests`, and `LinkedWordResolutionTests` (each
  linked word carries its entry's reading, summary, and gloss).
- **Translations.** With Sentence Translations on, each card shows a translation beneath the
  Japanese. By default YouTube's translation is used, and Apple Translation fills lines it leaves
  out. Choosing Apple in Reading Aids translates every line on the device instead, so each
  translation matches its line. YouTube often translates a whole sentence that spans several
  caption lines. When those are at most two lines and 40 characters, they merge into one card;
  otherwise every line keeps its own card and the sentence appears on its last line, where
  YouTube shows it, so no card grows taller than the screen. Apple Translation runs only once its Japanese language is downloaded, and Player
  never interrupts playback to ask. When YouTube refuses its translation or sends one Zenbu can't
  read, the cards show the Japanese alone, which Apple Translation then fills, and a
  [crash report](crash-reports.md) says which step failed and, for a refusal, YouTube's HTTP
  status, never the video, its captions, or the address.
  Check: UI `PlayerWatchUITests.testAVideoListsItsCaptionCardsWithTheShareOfWordsKnown` (each
  card's translation); package `YouTubeCaptionsTests`, `SentenceTranslationPairingTests`,
  `TranslationSentenceTests`, `CaptionCardSizeTests`, and `YouTubeTranslationFailureTests` (a
  refused or unreadable translation is reported with its step and status, and the Japanese cues
  still load).
- **Comprehension.** Every caption line is counted when the video opens, and the line reads
  **Counting known words…** until the count is ready. The known share counts each occurrence of
  a dictionary word, leaving out particles, auxiliaries, punctuation, and text the dictionary
  doesn't recognize, and updates as words are marked known. Leaving the video stops a count
  still running. Recent shows the last figure as a pill on each thumbnail.
  Check: package `KnownWordCountTests` (the words fixed captions count, each by its ID, what a
  learner who knows two of them sees, and a count that stops when it is cancelled) and
  `PlayerReadingAidTests` (counting known words among countable occurrences); UI
  `PlayerWatchUITests.testAVideoListsItsCaptionCardsWithTheShareOfWordsKnown` (0 of 12 words
  known for its three captions).
- **Playback controls.** A compact bar on its own background sits between the player and the caption
  cards. A thin scrubber along its top edge can be dragged to any point. Below it, the elapsed and
  total time sit beside buttons that go to the previous line, play or pause, and go to the next
  line, and a speed menu plays the video at 0.5×, 0.75×, 1×, 1.25×, or 1.5×. As the video plays,
  only the time and the scrubber follow it five times a second, and the caption list redraws only
  when the line changes. The rest of the screen isn't redrawn, so the speed and **•••** menus open
  and stay still while a line plays or repeats. VoiceOver reads the scrubber as "Playback position,
  0:02 of 0:12", the elapsed and total time, on every device, and skips the time text beside it, so
  it says the position and the length once. At the accessibility text sizes the bar stays at the
  largest standard size, so it keeps to one line, and pressing and holding a button shows it larger,
  as the conversation's controls do; each button can be tapped across 44 by 44 points. A **Video
  Unavailable** message longer than the video's frame scrolls inside it.
- **Repeat line.** The repeat button beside the speed menu plays the current line over and over
  until it's turned off. While repeating, the previous and next line buttons, tapping a card, or
  dragging the scrubber move the repeat to that line.
- **Line-by-line skipping.** While the video plays, the previous and next line buttons jump to
  that line and keep playing. While it's paused, they play just that line and pause again at its
  end, so a learner can step through the video one line at a time.
  Check: UI `PlayerWatchUITests.testThePlayersOwnControlsPlayStepAndRepeat` (play, the next and
  previous lines, repeat, a speed chosen while a line repeats, and the scrubber, against the
  stand-in player; the screen, the speed menu, and the caption list each count their own draws, and
  none of the counts moves while the playback position shows three seconds of a repeating line);
  package `YouTubeCaptionsTests` (each line's times, which the controls move between).

Creator-made Japanese captions are used before automatic ones. Sound descriptions such as [音楽] are
removed, and lines with nothing else are dropped, so songs show only their lyrics. A video without
Japanese captions shows **No Japanese Captions**. Captions and translations come from YouTube each
time a video opens and are not stored or synced.

Check: UI `PlayerWatchUITests.testAVideoWithoutJapaneseCaptionsSaysSo`; package
`YouTubeCaptionsTests` (creator-made before automatic captions), `YouTubeStandInTests` (the
stand-in's captions go through the same parsing), and `PlayerReadingAidTests` (sound tags
dropped).
