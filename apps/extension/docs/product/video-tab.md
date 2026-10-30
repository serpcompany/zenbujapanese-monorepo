# Player tab

The side panel's Player tab, its first, is the transcript of the YouTube video in the tab the
learner is on ([`side-panel.md`](side-panel.md)), in the iPhone app's Player design: the owner
approved the canvas on #1172. On a tab with no video it shows that there is none, with Recent under
it; Recent shows only then, never under a transcript. The transcript is a control bar, then a card
for each line, with the line playing lit; a click on a card plays from its line, and a click on a
word opens its card in a sheet over the lower half of the tab. The lines and the video come from
the watch page ([`youtube-captions.md`](youtube-captions.md)); the words, their card, and the
English are Translate's ([`translate.md`](translate.md), [`word-popup.md`](word-popup.md)). The
text is in `src/video-tab/labels.ts`. The tests named here are in `src/video-tab/` unless a path
says otherwise: `video-tab.interaction.test.tsx` (Video tab), `control-bar.interaction.test.tsx`
(Control bar), `transcript.interaction.test.tsx` (Transcript) and
`known-words.interaction.test.tsx` (Known words), in happy-dom, with a stand-in
YouTube, the real captions service and watch page, a stand-in for YouTube's video, and a stand-in
Translator; and the browser tests in `e2e/`.

## What a learner sees

| Behavior | Check |
| --- | --- |
| On a YouTube watch page, the video's title, taken from the tab's own title without YouTube's count of notifications and " - YouTube", then a card for each caption line, with the time it runs at its top right, such as 0:05 – 0:09. Nothing is fetched for the title. | Video tab: "shows the video's title over a card for each line…" |
| It follows the tab the learner is on: another tab, or a YouTube page that isn't a video, shows "No video on this tab", and coming back shows the video again. | Video tab: "follows the active tab…", "shows No video on this tab…" |
| The card of the line playing is lit, with a blue ring on a blue tint: the first before the first line, and the last one played between lines. | Video tab: "lights the card of the line playing…" |
| The card playing is kept in view, in the middle of the list. | Transcript: "keeps the playing card in view…" |
| A click on a card, or Enter or Space on it, plays the video from the start of its line. The card is a button named for it, such as "Play from 0:11". | Video tab: "plays the video from a card's line from a click on the card", "plays from a card's line from Enter or Space on the card" |
| While an ad plays, no card is lit and a click on a card does nothing; after it, the light comes back. | Video tab: "during an ad…" |
| A long line wraps inside its card onto as many rows as it needs, breaking a row only where the next word doesn't fit, with no sideways scroll at 320 or 500 pixels, Word Meanings off or on, and no furigana over the line above. | `e2e/transcript-long-lines.spec.ts`: "wraps short and long captions inside their cards…" |

## The control bar

Above the cards, as on the iPhone: the time the video is at, Previous, Play or Pause, Next, Repeat
line, and the speed. Its repeat is the panel's own, apart from the one on the video (#1173's).

| Behavior | Check |
| --- | --- |
| It sits over the transcript with the time the video is at. | Control bar: "sits over the transcript with the time the video is at" |
| Play or Pause plays and pauses the video, and its name says which it will do. | Control bar: "plays and pauses the video…" |
| Next and Previous go to the next and previous lines while the video plays; paused, Next plays one line. | Control bar: "goes to the next and previous lines…", "paused, plays one line from Next" |
| Repeat line repeats the line until it is clicked again, and shows pressed until then. | Control bar: "repeats the line from Repeat line…" |
| The speed, 0.5× to 1.5×, is set in its menu. | Control bar: "sets the speed from 0.5× to 1.5×…" |
| While an ad plays, it does nothing. | Control bar: "does nothing during an ad" |

## The lines' states

The tab asks for a video's lines only while it is shown: once it is shown, and once for each next
video it shows. With Zenbu Captions off, a video the tab moves to while it is hidden or closed is
asked for only once the tab is shown on it. A card's click, the reading aids, and the English ask
YouTube nothing: the lines come once per video ([`youtube-captions.md`](youtube-captions.md)).

| State | What the tab shows | Check |
| --- | --- | --- |
| Lines coming | "Getting this video's captions…" | Video tab: "says it is getting the captions until they come" |
| No Japanese track | "No Japanese Captions" | Video tab: "shows No Japanese Captions…" |
| YouTube refused the network (429) | "YouTube isn't sending captions to your network right now. Zenbu will try again in 17 minutes.", with the minutes left, and Try again, which asks YouTube again at once. | Video tab: "shows the rate-limit line…" |
| A failure | Its reason, as the watch page gives it, such as "YouTube didn't send this video's captions.", and Try again. | Video tab: "shows a failed line with Try again…" |
| The service worker didn't answer | "Zenbu didn't answer. Try again.", and Try again. | Video tab: "says Zenbu didn't answer…" |
| Zenbu Captions off | The lines, as with them on, also for the next video it is shown on. | Video tab: "with Zenbu Captions off, still asks…", "with Zenbu Captions off, gets the next video's lines while shown…" |
| No video, Recent signed out | Under "No video on this tab", Recent: "No recent videos", that a Zenbu account keeps the videos watched on all devices, and "Sign up or sign in", which opens the Account tab. | `recent.interaction.test.tsx`: "offers Sign up or sign in signed out, and explains Recent signed in…" |
| No video, Recent signed in | "No recent videos" and that the videos watched show here, on all devices, with no sign-in offer. It changes the moment the account signs in or out, with the panel open, with no reopening. | `recent.interaction.test.tsx`: "offers Sign up or sign in signed out, and explains Recent signed in…" |
| No video, Recent while the account loads | Under "No video on this tab", the Recent heading and nothing under it: neither "No recent videos" nor "Sign up or sign in", until the account is known. | `recent.interaction.test.tsx`: "shows neither the signed-out text nor the sign-in offer while the account is still loading" |

The tab reads the active tab, asks for lines, and follows the video only once it has been shown.
With another tab chosen, it stops following the video and keeps its lines; shown again, it follows
the video again and asks nothing (Video tab: "reads the tab, asks for captions and follows the
video only once it is shown").

## Words

| Behavior | Check |
| --- | --- |
| Each word of a line is underlined, as in Translate, with the reading aids turned on in Settings: furigana, a romaji line, and each word's short meaning. Turning one on or off changes the cards with no reload. | Transcript: "follows the reading aids in the settings" |
| Each word has its own underline, apart from the next, with Word Meanings off or on. A word stays together under furigana wider than it, centred under it as on the canvas, rather than spread apart. | `e2e/transcript-meanings.spec.ts`: "gives each word in the transcript its own underline…"; `e2e/transcript-long-lines.spec.ts` |
| A particle has no meaning, and with Word Meanings on stays with the word before it. A particle is a word whose dictionary entry's parts of speech are only particles. | Transcript: "puts no meaning under a particle…"; `e2e/transcript-meanings.spec.ts` |
| A known word has no underline and no meaning, and with Hide Furigana on Known Words, no furigana. A word a failed request missed is asked for again once the known words next change. | Known words: "gives a known word no underline and no meaning…", "asks again for the known words a failed request missed…" |
| A meaning never touches its neighbour's, at 380 pixels and at 360. It is blue, at least 4.5:1 against the card in light and dark. One wider than 8em is cut with an ellipsis, and its sense's full text is its tooltip and what a screen reader reads. | `e2e/transcript-meanings.spec.ts`: "spaces long neighbouring word meanings apart…", "gives a cut word meaning its full text…" |
| A word's short meaning is looked up once for the whole transcript, however many cards it is in. | Transcript: "looks up a word's meaning once for the whole transcript" |

## A word's sheet

| Behavior | Check |
| --- | --- |
| A click on a word pauses the video and opens the word's card in a sheet over the lower half of the tab, with the word in blue. Its line's card moves to the middle of the space above the sheet, and the notices above the cards, such as the English download, are put away while the sheet shows, so the line fits. No card opens on the watch page. | Transcript: "opens over the lower half of the tab from a click on a word…", "keeps the playing card in view, and moves the card of a word opened…", "puts the notices above the cards away while it shows…"; `e2e/transcript-word-sheet.spec.ts`: "a word clicked in the transcript pauses the video and opens its card in a sheet…" |
| Its X, or Esc, closes it and plays the video again, only if it was playing. | Transcript: "closes from its X…", "closes from Esc…", "leaves a paused video paused when it closes"; `e2e/transcript-word-sheet.spec.ts` |
| Its card is the Word popup's, with the same ••• menu: Status, Add to List… and Add Note save to the account, and signed out, Known says to sign in, in the sheet. | `e2e/transcript-word-sheet.spec.ts`: "a transcript word's sheet offers the ••• menu's Status…" |
| Its handle switches it between half and full height. | Transcript: "goes to full height from its handle, and back to half"; `e2e/transcript-word-sheet.spec.ts` |
| Another word shows in the same sheet, at the same height, and the video plays again only once the sheet closes. | Transcript: "shows another word in the same sheet…" |
| A click on a card closes the sheet with no play of its own, and plays from that card's line. | Transcript: "closes with no play of its own from a click on a card…"; `e2e/transcript-word-sheet.spec.ts`: "a card clicked while a word's sheet is open…" |
| A word opened with Enter or Space puts focus in the card, and closing the sheet gives focus back to the word. | Transcript: "takes focus when a key opens it…"; `e2e/transcript-word-sheet.spec.ts`: "a transcript word opened with Enter shows its sheet…" |
| The card's Open Full Entry expands it in place into the word's full entry; it opens no page over the Player tab. | Transcript: "expands the card in place into the word's full entry" |
| Closing the transcript with the sheet open, by closing the panel or moving to another video, counts as closing the sheet: a video that was playing plays again. | Transcript: "plays the video again when the transcript closes with the sheet open" |
| One word card shows at a time (#1185). Opening the sheet takes down a word card the watch page shows, such as a caption word's, keeping the video paused. A caption word clicked while the sheet shows puts the sheet away, and the video stays paused until the page's last card closes, then plays once, only if it was playing. A word opened again takes the place back. | Transcript ("a word's sheet and the page"): "asks the page to take any word card down…", "goes away when a word card on the page takes its place…", "takes the place back from the page's card…"; `e2e/transcript-word-sheet.spec.ts`: "a transcript word takes a caption word's card off the page…", with and without Every Site given |
| A card asked for on another tab closes the sheet, and the video plays again. On a tab whose page can't hold a card, such as one with no Zenbu in it, the sheet still opens. | Transcript: "closes, and plays the video again, when a card asked for on another tab ends its hold", "stays open on a tab whose page can't hold a card" |

## English

Each line's English is under it, from Chrome's Translator on this computer, one line at a time, as
in Translate; nothing is sent anywhere. Translations off in Settings hides it and asks the
Translator nothing.

| Behavior | Check |
| --- | --- |
| Each card has its own English, asked for one line at a time. | Transcript: "gives each row its own English…" |
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
Captions' Live Captions is #968's. Hide Furigana on Known Words draws nothing on the caption on
the player: the ••• menu marks a word Known, and the transcript follows it, but the caption doesn't
yet (#1187). Where the Player tab differs from the canvas:

- The video's title stays in the tab, not the header, which is #1184's.
- No scrubber and no length: Playback has no duration, and #1186 is changing the follower.
- Furigana is 12 pixels, the smallest the extension draws (`furigana` in `@zenbu/ui`'s theme), not
  the canvas's .62em.
- A press outside the sheet doesn't close it.

The browser tests open the Player tab on the stand-in watch page for the sheet
(`e2e/transcript-word-sheet.spec.ts`), and on a stand-in transcript for meanings and long lines
(`e2e/transcript-meanings.spec.ts`, `e2e/transcript-long-lines.spec.ts`). The agent Chrome
harness's stand-in watch page is where the rest is checked in Chrome
([`tech-debt.md`](../../../../docs/tech-debt.md)).
