# Video tab

The side panel's Video tab is the transcript of the YouTube video in the tab the learner is on:
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

The tab asks for a video's lines once it is shown, and once for each video it shows after that,
also with Zenbu Captions off. A row's click, the reading aids, and the English ask YouTube
nothing: the lines come once per video ([`youtube-captions.md`](youtube-captions.md)).

| State | What the tab shows | Check |
| --- | --- | --- |
| Lines coming | "Getting this video's captions…" | Video tab: "says it is getting the captions until they come" |
| No Japanese track | "No Japanese Captions" | Video tab: "shows No Japanese Captions…" |
| YouTube refused the network (429) | "YouTube isn't sending captions to your network right now. Zenbu will try again in 17 minutes.", with the minutes left, and Try again, which asks YouTube again at once. | Video tab: "shows the rate-limit line…" |
| A failure | Its reason, as the watch page gives it, such as "YouTube didn't send this video's captions.", and Try again. | Video tab: "shows a failed line with Try again…" |
| The service worker didn't answer | "Zenbu didn't answer. Try again.", and Try again. | Video tab: "says Zenbu didn't answer…" |
| Zenbu Captions off | The lines, as with them on. | Video tab: "with Zenbu Captions off…" |

The tab reads the active tab, asks for lines, and follows the video only once it has been shown.
With another tab chosen, it stops following the video and keeps its lines; shown again, it follows
the video again and asks nothing (Video tab: "reads the tab, asks for captions and follows the
video only once it is shown").

## Words

| Behavior | Check |
| --- | --- |
| Each word of a line is underlined, as in Translate, with the reading aids turned on in Settings: furigana, a romaji line, and each word's short meaning. Turning one on or off changes the rows with no reload. | Transcript: "follows the reading aids in the settings" |
| A click on a word opens the word popup under its line, and the video pauses. Closing it, with Close or Escape, plays the video again, only if it was playing. | Transcript: "opens a word's popup and pauses the video…", "leaves a paused video paused…" |
| One popup is open at a time: a word in another row closes the first, and the video plays again only when the last closes. | Transcript: "keeps one popup open at a time…" |
| The popup's Open Full Entry opens the word's Word Detail over the Video tab. | Transcript: "opens Word Detail from the popup's Open Full Entry" |

## English

Each line's English is under it, from Chrome's Translator on this computer, one line at a time, as
in Translate; nothing is sent anywhere. Translations off in Settings hides it and asks the
Translator nothing.

| Behavior | Check |
| --- | --- |
| Each row has its own English, asked for one line at a time. | Transcript: "gives each row its own English…" |
| Before Japanese to English is downloaded: "Download Japanese for Translate to see each line in English." and Download. Only the click starts it; then its progress, then each line's English. | Transcript: "before the download, starts it only from a click on Download…" |
| A download that fails says "The download didn't finish. Try again.", and Download starts it again. | Transcript: "says so when the download fails…" |
| On a computer that can't translate Japanese: "Translate isn't available on this computer." | Transcript: "says so when this computer can't translate Japanese" |
| With Translations off, no English, and no request to the Translator. | Transcript: "hides the English with Translations off…" |

## Following the video

The tab follows the video only while it is shown: it tells the watch page when it opens and when
it closes, and the page sends its playback only while a Video tab is open for it, at most ten times
a second while it plays, and at once on a jump of a second or more, a pause, a speed change, or an
ad. A page that
isn't ready yet is asked again, after 2 seconds, then longer each time, up to 10
(`src/video/youtube-page.interaction.test.tsx`, "the playback it sends a Video tab";
`src/video/video-tab-port.test.ts`). How it's built is in
[`extension-captions.md`](../../../../docs/agents/extension-captions.md).

## Not built yet

The share of the video's words the learner knows, beside the title, is #965's, and No Japanese
Captions' Live Captions is #968's. Hide Furigana on Known Words draws nothing: nothing marks a word
known. No browser test opens the Video tab on a watch page: the tests above run in happy-dom, and
a stand-in watch page in Chrome waits for #952 ([`tech-debt.md`](../../../../docs/tech-debt.md)).
