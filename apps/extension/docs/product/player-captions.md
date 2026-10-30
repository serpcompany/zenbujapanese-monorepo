# The caption on the player

On a YouTube watch page, with Zenbu Captions on, Zenbu draws the line being heard on YouTube's
player, in place of YouTube's own captions, with the line controls at the player's top right. The
lines come from the watch page, once per video ([`youtube-captions.md`](youtube-captions.md)); the
words, their popup, and the English are the same as the Player tab's and Translate's
([`video-tab.md`](video-tab.md), [`word-popup.md`](word-popup.md)). YouTube's layout doesn't
change. The text is in `src/player-captions/labels.ts`. How it's built is in
[`extension-captions.md`](../../../../docs/agents/extension-captions.md), The caption on the player.

The tests named here are in `src/player-captions/` unless a path says otherwise:
`line-controls.test.ts` (Lines), `caption-place.test.ts` (Place),
`player-captions.interaction.test.tsx` (Caption), `caption-drag.interaction.test.tsx` (Drag), and
`player-controls.interaction.test.tsx` (Controls), in happy-dom with a stand-in clock for the
video, a stand-in Translator, and the fixture words; `src/video/youtube-page-captions.interaction.test.tsx`
(Watch page), on the real captions service and watch page with a stand-in YouTube; and
`e2e/player-captions.spec.ts` (Browser) and `e2e/caption-drag.spec.ts` (Browser drag), in Playwright's Chromium with the test build on the agent
Chrome harness's stand-in watch page under `www.youtube.com`, which asks YouTube nothing.

On a Netflix watch page it is the same caption and controls on Netflix's player: Netflix's own
subtitles are hidden while it shows and back with Zenbu Captions off, and every control seeks,
plays, and sets the speed through Netflix's player ([`netflix.md`](netflix.md)).

## The caption

| Behavior | Check |
| --- | --- |
| The line being heard sits at the bottom of the player, or where the learner moved it, white on a dark band, sized to the player, and nothing shows between lines. It is drawn in its own shadow root inside the player, so YouTube's styles don't reach it and nothing is added to the page's own styles. | Caption: "sits in the follower's caption host…"; Browser: "draws the line being heard inside the player…" |
| YouTube's own captions are hidden while it shows. With Zenbu Captions off in Settings, or Zenbu off for www.youtube.com (the side panel header's site switch), it shows nothing and leaves YouTube's captions; turning either off takes it away and shows YouTube's again at once, and turning it on brings it back with no new request to YouTube. | Watch page: "shows the video's lines in place of the site's captions…", "with Zenbu Captions off…", "takes the caption away when Zenbu Captions turns off…", "takes the caption away when Zenbu turns off for the site…", "shows none on a watch page of a site Zenbu is off for"; Browser: "draws the line being heard…" |
| A video without Japanese captions shows nothing. Opening another video shows that video's lines. While the player holds a video other than the lines' video, before the page says it navigated, it draws nothing and the controls and Repeat leave the video alone (with a follower that reports the new video; YouTube's reports the one it was started for). | Watch page: "shows nothing for a video without Japanese captions", "moves to the next video's lines…", "draws nothing over the next video before the page says it opened…"; Caption: "draws nothing over it"; Lines: "another video in the element" |
| Each word is underlined, with the reading aids turned on in Settings: furigana, a romaji line, and each word's short meaning. Turning one on or off changes the caption with no reload. | Caption: "underlines the line's words…", "follows the reading aids…"; Watch page: "passes each settings change to the caption"; Browser: "draws the line being heard…" |
| Each word has its own underline, half a rem from the word before it, so two neighbouring words' underlines never join, with Word Meanings off or on; turning Word Meanings on or off doesn't change where one word ends and the next begins. | Browser: "gives each word on the caption its own underline…" |
| A meaning is white at 70%, at least 4.5:1 against the band over the brightest frame, whatever the page's theme. | Browser: "draws word meanings on the caption at least 4.5:1…" |
| The line's English is under it, from Chrome's Translator on this computer, asked for this line and the next only. With Translations off, no English and nothing asked. | Caption: "shows the line's English under it…", "shows no English and asks for none while Translations is off" |
| Until Japanese to English is downloaded, the caption shows the Japanese and its romaji line, as the reading aids say, and no English; it never starts the download, which the Player tab offers. Once it is downloaded, the English shows. | Caption: "shows Japanese and romaji until the model is downloaded…" |
| While an ad plays, no caption and no controls show, and YouTube's own captions come back; after it, the caption and controls come back and YouTube's are hidden again. | Caption: "during an ad…" |
| Clicks on the caption and the controls don't reach YouTube's player, so they don't pause the video. Of the keys, only Space and Enter on a focused control, the speed menu's own keys while it is open, a popup's menu's or sheet's while it is open, and, while a caption word's card is expanded into its full entry, the arrows, Home, End, Page Up, and Page Down, which scroll the entry, are kept from YouTube; every other key, such as f or an arrow after a click on Next, works YouTube's shortcuts, and Escape always reaches the page. | Caption: "keeps clicks, and the keys a control acts on, from the player…", "lets YouTube's own shortcuts reach the page after a mouse click…", "keeps the speed menu's own keys inside…"; `src/player-captions/kept-inside.interaction.test.tsx`: "keeps a menu's own keys inside only while the menu is open…", "keeps the keys that scroll inside while the card is expanded into its full entry" |

## Moving the caption

The caption's background is a handle: the learner drags it anywhere inside the player. Its words
are not. Since a press on the line drags it, the caption's text can't be selected; to copy a line,
or take it into Translate's **Use Selection**, the learner selects it in the side panel's
[Video tab](video-tab.md) transcript.

| Behavior | Check |
| --- | --- |
| Over the caption's background the pointer is a grab hand, and while dragging it is a closed hand; over a word it is the word's pointer. | Browser drag: "shows a grab hand over the caption's background…" |
| A drag from the background moves the caption with the pointer, and it stops at the player's edges, so it stays wholly inside, 16 pixels from the sides. When one line runs straight into the next mid-drag, the new line stays where the pointer holds it, whatever its size. A press that moves less than 3 pixels, a press with another button, and a drag from a word move nothing. | Drag: "moves the box by the pointer's movement…", "keeps the box under the pointer when one line runs straight into the next mid-drag", "keeps the box wholly inside the player at every edge", "moves nothing for a press that doesn't move, a press with another button, or a drag from a word…"; Place: "moves by the pointer's movement until the box meets an edge…", "keeps the pointer where it held a box whose size changes…"; Browser drag: "shows a grab hand…", "keeps the caption under the pointer when the line changes mid-drag", "keeps the caption wholly inside the player at every edge" |
| A drag doesn't reach YouTube's player, so the video neither pauses nor seeks, and the controls show as they do while the pointer moves over the player. After a drag a word still opens its popup. | Drag: "moves the box by the pointer's movement and keeps the place, with the video playing on", "…and a word still opens its popup after a drag"; Browser drag: "shows a grab hand…" |
| The place is kept as a share of the room the player leaves around the caption, across and down, so it holds when the player resizes, in theatre and fullscreen, for the next line, the next video, and the next visit. If the line ends mid-drag, the place it got to is kept. It is kept on this computer only, with the settings, and is not synced. | Place: "is the box's offset as a share of the room…", "draws a place inside the room at any size…"; Drag: "keeps the place across lines and settings changes…"; `src/shared/settings.test.ts`: "keeps the caption's place only as two shares…"; Browser drag: "keeps the caption's place when the player resizes, in fullscreen, and for the next video…" |
| A double-click on the background puts it back at the bottom of the player; one on a word doesn't. | Drag: "goes back to its default place on a double-click on the background, not on a word"; Browser drag: "…and a double-click puts it back" |

## A word's popup

| Behavior | Check |
| --- | --- |
| A click on a word opens its word popup over the player, also in fullscreen, and the video pauses, with "Paused while the popup is open" at the top right. | Caption: "underlines the line's words, and a word opens the word popup", "pauses, says so…"; `src/word-popup/popup-host.interaction.test.tsx`: "mounts inside the page's fullscreen element…"; Browser: "pauses the video while a word's popup is open…" |
| Closing it, with Escape or a click outside, plays the video again only if it was playing when the popup opened; so does the caption going away with the popup open. | Caption: "pauses, says so, and plays again when the popup closes", "stays paused after the popup closes…", "stopping takes the caption away and closes the popup, playing again…", "stopping leaves a video paused…"; Browser: "pauses the video while a word's popup is open…" |
| In the fullscreen player, a click or Space on the popup's buttons doesn't reach YouTube's player, so the video stays paused. | Caption: "keeps a click and Space on its buttons from the player…" |
| Moving from one word to another keeps the video paused. | Caption: "keeps the video paused while the learner moves from one word to another" |

## The line controls

Previous line, Play or Pause, Next line, Repeat line, and the speed, as the app's Player has them
([`player.md`](../../../ios/docs/product/player.md), Line-by-line skipping and Repeat line). None
asks YouTube for anything (Browser: "draws the line being heard…").

| Behavior | Check |
| --- | --- |
| While the video plays, Next and Previous go to the start of that line and keep playing. | Lines: "while playing, jump to that line and keep playing"; Controls: "move to the next and previous line…" |
| Next and Previous seek to the line's start exactly. While it is paused, they play just that line and pause again at its end, also when the seek lands a little early or late, and on a last line that ends after the video, where the video ends. Before the first line, either goes to the first. | Lines: "while paused, play just that line…", "from before the first line…", "pause where the learner paused…", "a seek that lands off its target", "the last line of a video that ends before it" |
| Repeat line plays the line again from its start each time it ends, once per end and never twice within 700 ms, at every speed and when a seek lands 200 ms early or late, until it is turned off. A last line that ends after the video repeats from where the video ends. Next, Previous, and a seek move it to that line. Turned on while paused, it goes to the line's start without playing. | Lines: "Repeat line" (each, with "seeks once per line end at…" and "loops a last line that ends after the video does…"); Controls: "move to the next and previous line, repeat a line…"; Browser: "draws the line being heard…" |
| The speed menu offers 0.5×, 0.75×, 1×, 1.25×, and 1.5×, opens inside the player, also in fullscreen, and closes on a choice. The speed chosen stays across a line change, Repeat, and an ad. | Lines: "chosen while repeating, stays across a line change and an ad"; Controls: "choose a speed…"; Browser: "opens the speed menu inside the player…" |
| A seek from the Player tab moves Repeat with it. | Watch page: "sends the Video tab's seeks through the caption…" |

## When the controls show

The caption always shows while a line is heard. The controls show while the video is paused,
while the pointer moves over the player and for 3 seconds after it rests, while it is over the
controls, while a control has focus from the keyboard, while the speed menu is open, and while a
word's popup is open; otherwise they fade out (Controls: "when the controls show", each).

## Not built yet

The caption has no keyboard move, and moved to the top right it can cover the line controls
until it is dragged away. After the extension updates or reloads, a watch page that was already open shows no caption until
the learner reloads it (#1114). Live Captions for a video with no Japanese captions are #968's, and the share of the video's words
the learner knows is #965's. The fullscreen screenshots and a counted
Repeat run in branded Chrome are the agent Chrome harness's, by hand.
