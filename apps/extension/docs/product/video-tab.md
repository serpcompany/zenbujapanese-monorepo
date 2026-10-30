# Player tab

The side panel's Player tab, which was its Video tab, is the transcript of the YouTube video in
the tab the learner is on ([`side-panel.md`](side-panel.md)). On a tab with no video it shows that
there is none, with Recent under it; Recent shows only then, never under a transcript. The
transcript is
its lines, the line playing, each line's words and English, and a click to go to a line. The
lines and the video come from the watch page ([`youtube-captions.md`](youtube-captions.md)); the
words, their popup, and the English are Translate's ([`translate.md`](translate.md),
[`word-popup.md`](word-popup.md)). The text is in `src/video-tab/labels.ts`. The tests named here
are in `src/video-tab/` unless a path says otherwise: `video-tab.interaction.test.tsx` (Video tab)
and `transcript.interaction.test.tsx` (Transcript), in happy-dom, with a stand-in YouTube, the
real captions service and watch page, a stand-in for YouTube's video, and a stand-in Translator.

## What a learner sees

| Behavior | Check |
| --- | --- |
| On a YouTube watch page, the video's title, taken from the tab's own title without YouTube's count of notifications and " - YouTube", then one row for each caption line, with the time it starts, such as 0:05. Nothing is fetched for the title. | Video tab: "shows the video's title over its lines…" |
| It follows the tab the learner is on: another tab, or a YouTube page that isn't a video, shows "No video on this tab", and coming back shows the video again. | Video tab: "follows the active tab…", "shows No video on this tab…" |
| The row of the line playing is highlighted, and the highlight follows the video, with none between lines. | Video tab: "highlights the row of the line playing…" |
| The row playing is kept in view, in the middle of the list. While a word's popup is open, the list stays where it is. | Transcript: "keeps the playing row in view…" |
| A click on a row moves the video to the start of its line. Its time is a button named for it, such as "Go to 0:11". | Video tab: "seeks the video to a row's start…" |
| While an ad plays, no row is highlighted and a click on a row does nothing; after it, the highlight comes back. | Video tab: "during an ad…" |

## The lines' states

The tab asks for a video's lines only while it is shown: once it is shown, and once for each next
video it shows. With Zenbu Captions off, a video the tab moves to while it is hidden or closed is
asked for only once the tab is shown on it. A row's click, the reading aids, and the English ask
YouTube nothing: the lines come once per video ([`youtube-captions.md`](youtube-captions.md)).

| State | What the tab shows | Check |
| --- | --- | --- |
| Lines coming | "Getting this video's captions…" | Video tab: "says it is getting the captions until they come" |
| No Japanese track | "No Japanese Captions" | Video tab: "shows No Japanese Captions…" |
| YouTube refused the network (429) | "YouTube isn't sending captions to your network right now. Zenbu will try again in 17 minutes.", with the minutes left, and Try again, which asks YouTube again at once. | Video tab: "shows the rate-limit line…" |
| A failure | Its reason, as the watch page gives it, such as "YouTube didn't send this video's captions.", and Try again. | Video tab: "shows a failed line with Try again…" |
| The service worker didn't answer | "Zenbu didn't answer. Try again.", and Try again. | Video tab: "says Zenbu didn't answer…" |
| Zenbu Captions off | The lines, as with them on, also for the next video it is shown on. | Video tab: "with Zenbu Captions off, still asks…", "with Zenbu Captions off, gets the next video's lines while shown…" |

The tab reads the active tab, asks for lines, and follows the video only once it has been shown.
With another tab chosen, it stops following the video and keeps its lines; shown again, it follows
the video again and asks nothing (Video tab: "reads the tab, asks for captions and follows the
video only once it is shown").

## Words

| Behavior | Check |
| --- | --- |
| Each word of a line is underlined, as in Translate, with the reading aids turned on in Settings: furigana, a romaji line, and each word's short meaning. Turning one on or off changes the rows with no reload. | Transcript: "follows the reading aids in the settings" |
| A meaning never touches its neighbour's: it is half a rem from the word before it, at 380 pixels and at the narrowest panel, 360. It is in the muted foreground, and the foreground on the line being played, at least 4.5:1 against the row in light and dark. One wider than its column is cut with an ellipsis, and its sense's full text is its tooltip and what a screen reader reads. | `e2e/transcript-meanings.spec.ts`: "spaces long neighbouring word meanings apart…", "gives a cut word meaning its full text…" |
| A click on a word opens its card on the watch page, as the word popup, beside the side panel's edge and level with the word's row as far as the page allows, and the video pauses; the panel shows no card ([`word-popup.md`](word-popup.md), A word's card from the side panel). A click on another word puts its card in the first one's place, and the video stays paused. Once the page closes the last card, with Escape, a click outside it, or Escape in the panel, the video plays again, only if it was playing. | Transcript: "opens a word's card on the page with no card in the panel, pausing the video until the page closes the last one"; `e2e/transcript-card-on-page.spec.ts`: "a word clicked in the transcript opens its card on the watch page, beside the panel and level with its row, with none in the panel" |
| Where the watch page can't show a card, as in a tab with no Zenbu in it, the card opens under the word's line in the panel at the popup's size or the line's width where that is narrower, and the video pauses. Closing it, with Escape or a press outside it, plays the video again, only if it was playing. | Transcript: "opens a word's popup and pauses the video…", "closes the popup on a press outside it…", "leaves a paused video paused…" |
| One card is open at a time: a word in another row closes the first, and the video plays again only when the last closes. | Transcript: "keeps one popup open at a time…" |
| Closing the transcript with a popup open, by closing the panel or moving to another video, counts as closing the popup: a video that was playing plays again. | Transcript: "plays the video again when the transcript closes with a popup open" |
| A word's short meaning is looked up once for the whole transcript, however many rows it is in. | Transcript: "looks up a word's meaning once for the whole transcript" |
| The card's Open Full Entry expands it in place into the word's full entry, on the page or, where the page can't show the card, in the panel; it opens no page over the Player tab. | Transcript: "expands the popup in place into the word's full entry where the page can't show the card"; on the page, `e2e/word-popup.spec.ts`: "Open Full Entry expands the popup in place…" |

## English

Each line's English is under it, from Chrome's Translator on this computer, one line at a time, as
in Translate; nothing is sent anywhere. Translations off in Settings hides it and asks the
Translator nothing.

| Behavior | Check |
| --- | --- |
| Each row has its own English, asked for one line at a time. | Transcript: "gives each row its own English…" |
| Once Chrome's Japanese translation is on this computer, from the welcome tab or anywhere else, no ask: each line's English. | `src/shared/welcome-translation.interaction.test.tsx`: "the Video tab and Translate translate both ways, and neither asks to download" |
| Before it is: "To see each line in English, download Chrome's own Japanese translation. It's apart from Zenbu's dictionary." and Download. Only the click starts it, as on the welcome tab's Download; then "Downloading Chrome's Japanese translation… 42%" with a progress bar, then each line's English. | Transcript: "before the download, starts it only from a click on Download…" |
| A download that fails says "The download didn't finish. Try again.", and Download starts it again. | Transcript: "says so when the download fails…" |
| Where Chrome reports its download already under way (`downloading`), as when the welcome tab's is still going: "Chrome is downloading its Japanese translation…" with no Download, checked again every 2 seconds, then each line's English. Chrome 156 reports `downloadable` during a download, so there the tab shows Download, and its click joins the running download. | Transcript: "while Chrome is already downloading, says so with no Download…" |
| On a computer that can't translate Japanese: "Translate isn't available on this computer." | Transcript: "says so when this computer can't translate Japanese" |
| A line the Translator didn't answer for says "Translate didn't answer." under it, with Try again, which asks for that line again. | Transcript: "shows Try again on a line Translate didn't answer…" |
| With Translations off, no English, and no request to the Translator. | Transcript: "hides the English with Translations off…" |

## Following the video

The tab follows the video only while it is shown: it tells the watch page when it opens and when
it closes, and the page sends its playback only while a Player tab is open for it, at most ten times
a second while it plays, and at once on a jump of a second or more, a pause, a speed change, or an
ad. When the last Player tab for the page closes, the page stops following the video. A page that
isn't ready yet is asked again, after 2 seconds, then longer each time, up to 10
(`src/video/youtube-page.interaction.test.tsx`, "the playback it sends a Video tab";
`src/video/video-tab-port.test.ts`).

A tab with no Zenbu in its page, such as a YouTube tab opened before Zenbu was installed or
updated, still shows the lines, but nothing in it answers: after the first try, the tab says
"Reload this tab to follow the video." over the lines, with Reload, which reloads that browser tab.
It keeps asking, and once the page answers, the line goes and the tab follows the video (Video
tab: "in a tab with no content script, says to reload it…"). How it's built is in
[`extension-captions.md`](../../../../docs/agents/extension-captions.md).

## Not built yet

The share of the video's words the learner knows, beside the title, is #965's, and No Japanese
Captions' Live Captions is #968's. Hide Furigana on Known Words draws nothing: nothing marks a word
known. One browser test opens the Player tab on the stand-in watch page, for a word's card
(`e2e/transcript-card-on-page.spec.ts`); the rest of the tests above run in happy-dom. The agent
Chrome harness's stand-in watch page is where the rest is checked in Chrome
([`tech-debt.md`](../../../../docs/tech-debt.md)).

A word's card on the watch page can't be reached from the keyboard: focus stays in the panel,
where Escape closes the card. With a transcript word's card open, a click on a caption word on
the page puts that word's card in its place, and the panel may then play the video again, though
a card is open (not checked in Chrome).
