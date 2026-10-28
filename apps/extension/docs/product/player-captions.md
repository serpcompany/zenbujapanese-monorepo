# The caption on the player

On a YouTube watch page, with Zenbu Captions on, Zenbu draws the line being heard on YouTube's
player, in place of YouTube's own captions, with the line controls at the player's top right. The
lines come from the watch page, once per video ([`youtube-captions.md`](youtube-captions.md)); the
words, their popup, and the English are the same as the Video tab's and Translate's
([`video-tab.md`](video-tab.md), [`word-popup.md`](word-popup.md)). YouTube's layout doesn't
change. The text is in `src/player-captions/labels.ts`. How it's built is in
[`extension-captions.md`](../../../../docs/agents/extension-captions.md), The caption on the player.

The tests named here are in `src/player-captions/` unless a path says otherwise:
`line-controls.test.ts` (Lines), `player-captions.interaction.test.tsx` (Caption), and
`player-controls.interaction.test.tsx` (Controls), in happy-dom with a stand-in clock for the
video, a stand-in Translator, and the fixture words; `src/video/youtube-page-captions.interaction.test.tsx`
(Watch page), on the real captions service and watch page with a stand-in YouTube; and
`e2e/player-captions.spec.ts` (Browser), in Playwright's Chromium with the test build on the agent
Chrome harness's stand-in watch page under `www.youtube.com`, which asks YouTube nothing.

## The caption

| Behavior | Check |
| --- | --- |
| The line being heard sits at the bottom of the player, white on a dark band, sized to the player, and nothing shows between lines. It is drawn in its own shadow root inside the player, so YouTube's styles don't reach it and nothing is added to the page's own styles. | Caption: "sits in the follower's caption host…"; Browser: "draws the line being heard inside the player…" |
| YouTube's own captions are hidden while it shows. With Zenbu Captions off in Settings, it shows nothing and leaves YouTube's captions; turning them off takes it away and shows YouTube's again, and turning them on brings it back with no new request to YouTube. | Watch page: "shows the video's lines in place of the site's captions…", "with Zenbu Captions off…", "takes the caption away when Zenbu Captions turns off…"; Browser: "draws the line being heard…" |
| A video without Japanese captions shows nothing. Opening another video shows that video's lines. | Watch page: "shows nothing for a video without Japanese captions", "moves to the next video's lines…" |
| Each word is underlined, with the reading aids turned on in Settings: furigana, a romaji line, and each word's short meaning. Turning one on or off changes the caption with no reload. | Caption: "underlines the line's words…", "follows the reading aids…"; Watch page: "passes each settings change to the caption"; Browser: "draws the line being heard…" |
| The line's English is under it, from Chrome's Translator on this computer, asked for this line and the next only. With Translations off, no English and nothing asked. | Caption: "shows the line's English under it…", "shows no English and asks for none while Translations is off" |
| Until Japanese to English is downloaded, the caption shows the Japanese and its romaji line, as the reading aids say, and no English; it never starts the download, which the Video tab offers. Once it is downloaded, the English shows. | Caption: "shows Japanese and romaji until the model is downloaded…" |
| While an ad plays, no caption and no controls show; both come back after it. | Caption: "during an ad…" |
| Clicks and keys on the caption and the controls don't reach YouTube's player, so they don't pause the video or work YouTube's shortcuts. Escape still reaches the page. | Caption: "keeps clicks and keys on the caption and controls from the player…" |

## A word's popup

| Behavior | Check |
| --- | --- |
| A click on a word opens its word popup over the player, also in fullscreen, and the video pauses, with "Paused while the popup is open" at the top right. | Caption: "underlines the line's words, and a word opens the word popup", "pauses, says so…"; `src/word-popup/popup-host.interaction.test.tsx`: "mounts inside the page's fullscreen element…"; Browser: "pauses the video while a word's popup is open…" |
| Closing it, with Close, Escape, or a click outside, plays the video again only if it was playing when the popup opened. | Caption: "pauses, says so, and plays again when the popup closes", "stays paused after the popup closes…"; Browser: "pauses the video while a word's popup is open…" |
| Moving from one word to another keeps the video paused. | Caption: "keeps the video paused while the learner moves from one word to another" |

## The line controls

Previous line, Play or Pause, Next line, Repeat line, and the speed, as the app's Player has them
([`player.md`](../../../ios/docs/product/player.md), Line-by-line skipping and Repeat line). None
asks YouTube for anything (Browser: "draws the line being heard…").

| Behavior | Check |
| --- | --- |
| While the video plays, Next and Previous go to the start of that line and keep playing. | Lines: "while playing, jump to that line and keep playing"; Controls: "move to the next and previous line…" |
| While it is paused, Next and Previous play just that line and pause again at its end. Before the first line, either goes to the first. | Lines: "while paused, play just that line…", "from before the first line…", "pause where the learner paused…" |
| Repeat line plays the line again from its start each time it ends, once per end, until it is turned off. Next, Previous, and a seek move it to that line. Turned on while paused, it goes to the line's start without playing. | Lines: "Repeat line" (each); Controls: "move to the next and previous line, repeat a line…"; Browser: "draws the line being heard…" |
| The speed menu offers 0.5×, 0.75×, 1×, 1.25×, and 1.5×, opens inside the player, also in fullscreen, and closes on a choice. The speed chosen stays across a line change, Repeat, and an ad. | Lines: "chosen while repeating, stays across a line change and an ad"; Controls: "choose a speed…"; Browser: "opens the speed menu inside the player…" |
| A seek from the Video tab moves Repeat with it. | Watch page: "sends the Video tab's seeks through the caption…" |

## When the controls show

The caption always shows while a line is heard. The controls show while the video is paused,
while the pointer moves over the player and for 3 seconds after it rests, while it is over the
controls, while a control has focus from the keyboard, while the speed menu is open, and while a
word's popup is open; otherwise they fade out (Controls: "when the controls show", each).

## Not built yet

Live Captions for a video with no Japanese captions are #968's, and the share of the video's words
the learner knows is #965's. Netflix's player is #966's. The fullscreen screenshots and a counted
Repeat run in branded Chrome are the agent Chrome harness's, by hand.
