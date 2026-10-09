# Player

Player is the app's third tab. A learner watches a YouTube video with its Japanese
captions listed below the player as caption cards, and looks up any captioned word with the same
dictionary sheet Image Search uses.

## Opening a video

- The tab has a search bar like a browser's address bar. Pasting a YouTube link (`watch?v=`,
  `youtu.be/`, `shorts/`, `embed/`, or `live/`) opens the video directly. Anything else searches
  YouTube and shows its results in the app; choosing a video from them opens it in Player.
  Check: package `YouTubeCaptionsTests` (which text is a video link, in every form, and each
  search provider's results page and the videos chosen from it); UI `PlayerUITests` (the search
  bar) and `PlayerWatchUITests` (a pasted link opens the video, with YouTube stood in). YouTube's
  own results page is by hand ([Player manual checks](../../../../docs/agents/ios.md#player-manual-checks)).
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
  ([Zenbu account and sync](index.md#zenbu-account-and-sync)): a video watched on one appears on
  the others in its place by when it was watched, with how far the learner got and its
  comprehension, and one removed on one is removed on all. Only this app syncs it; the website
  and other Zenbu apps don't see it. If a saved video can't be read, Recent keeps a copy of what
  was saved on the device rather than writing over it, keeps every video it can read, and keeps
  syncing ([Saved data that can't be read](index.md#saved-data-that-cant-be-read)).
  Check: package `AccountSyncWatchHistoryTests` (the 50, sync, and an unreadable Recent).

## Watching

The video plays in YouTube's embedded player at the top of the screen, and the tab bar stays
visible. The navigation bar reads **Player**, with a **•••** menu of quick switches for Furigana,
Furigana on Known Words, Word Meanings, and Translations, and **Share Video**. Between the
controls and the caption cards, a fixed line with a divider below it reports how many of the
captions' words the learner knows: the percentage, colored like the Recent pill, then the counts,
such as **73%** 38 of 52 words known. If the video's owner doesn't allow other apps to play it,
the player shows **Video Unavailable**.

Check: UI `PlayerWatchUITests.testAVideoListsItsCaptionCardsWithTheShareOfWordsKnown` and
`testAVideoItsOwnerWontShareSaysItsUnavailable`; package `PlayerReadingAidTests` (comprehension and
the reading aids' switches) and `YouTubeCaptionsTests` (an unplayable video). YouTube's real
player is by hand; the UI tests stand in for it with a local player that answers the same calls.

- **No caption overlay.** The player doesn't draw YouTube's own captions over the video; the
  caption cards below replace them.
- **Player's own controls.** YouTube's seek bar, captions, settings, and fullscreen buttons are
  hidden, and tapping the video plays or pauses it. YouTube still shows its title, share button,
  and logo when a video starts, buffers, or is paused.
- **Caption cards follow the video.** Below the player, the video's Japanese captions appear as
  one card per line. The card for the line being spoken gets a tinted fill and an accent-colored
  outline, and is scrolled to the center as the video plays. One line is always highlighted:
  between lines, the last spoken line stays highlighted, and before the first line starts, the
  first line is.
  Check: UI `PlayerWatchUITests.testAVideoListsItsCaptionCardsWithTheShareOfWordsKnown`; package
  `YouTubeCaptionsTests` (cues from timed text, without overlaps).
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
  page inside Player, so Back returns to the video. The same goes for the word sheet in Image
  Search and Translate, in their own tabs.
  Check: UI `PlayerWatchUITests.testAWordInACaptionOpensItsEntryInsidePlayer`, `ImageSearchUITests`,
  and `ConversationUITests.testAWordsFullEntryShowsTheSessionBarThatReturns` (the same sheet in
  Image Search and Translate); package `WordSheetPresentationTests` and `PlayerReadingAidTests`.
- **Translations.** With Sentence Translations on, each card shows a translation beneath the
  Japanese. By default YouTube's translation is used, and Apple Translation fills lines it leaves
  out. Choosing Apple in Reading Aids translates every line on the device instead, so each
  translation matches its line. YouTube often translates a whole sentence that spans several
  caption lines. When those are at most two lines and 40 characters, they merge into one card;
  otherwise every line keeps its own card and the sentence appears on its last line, where
  YouTube shows it, so no card grows taller than the screen. Apple Translation runs only once its Japanese language is downloaded, and Player
  never interrupts playback to ask.
  Check: UI `PlayerWatchUITests.testAVideoListsItsCaptionCardsWithTheShareOfWordsKnown` (each
  card's translation); package `YouTubeCaptionsTests`, `SentenceTranslationPairingTests`,
  `TranslationSentenceTests`, and `CaptionCardSizeTests`.
- **Comprehension.** Every caption line is analyzed when the video opens. The known share counts
  each occurrence of a dictionary word, leaving out particles, auxiliaries, punctuation, and text
  the dictionary doesn't recognize, and updates as words are marked known. Recent shows the last
  figure as a pill on each thumbnail.
  Check: package `PlayerReadingAidTests` (counting known words among countable occurrences); UI
  `PlayerWatchUITests.testAVideoListsItsCaptionCardsWithTheShareOfWordsKnown`.
- **Playback controls.** A compact bar on its own background sits between the player and the
  caption cards. A thin scrubber along its top edge can be dragged to any point. Below it, the
  elapsed and total time sit beside buttons that go to the previous line, play or pause, and go
  to the next line, and a speed menu plays the video at 0.5×, 0.75×, 1×, 1.25×, or 1.5×.
- **Repeat line.** The repeat button beside the speed menu plays the current line over and over
  until it's turned off. While repeating, the previous and next line buttons, tapping a card, or
  dragging the scrubber move the repeat to that line.
- **Line-by-line skipping.** While the video plays, the previous and next line buttons jump to
  that line and keep playing. While it's paused, they play just that line and pause again at its
  end, so a learner can step through the video one line at a time.
  Check: UI `PlayerWatchUITests.testThePlayersOwnControlsPlayStepAndRepeat` (play, the next and
  previous lines, repeat, the speeds, and the scrubber, against the stand-in player); package
  `YouTubeCaptionsTests` (each line's times, which the controls move between).

Creator-made Japanese captions are used before automatic ones. Sound descriptions such as [音楽] are
removed, and lines with nothing else are dropped, so songs show only their lyrics. A video without
Japanese captions shows **No Japanese Captions**. Captions and translations come from YouTube each
time a video opens and are not stored or synced.

Check: UI `PlayerWatchUITests.testAVideoWithoutJapaneseCaptionsSaysSo`; package
`YouTubeCaptionsTests` (creator-made before automatic captions), `YouTubeStandInTests` (the
stand-in's captions go through the same parsing), and `PlayerReadingAidTests` (sound tags
dropped).
