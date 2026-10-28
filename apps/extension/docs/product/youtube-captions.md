# YouTube captions and playback

On a YouTube watch page, the extension gets the video's Japanese captions and follows the video,
so the side panel's Video tab ([`video-tab.md`](video-tab.md)) and the caption on the player
([`player-captions.md`](player-captions.md)) can show them and drive it. How it's built is in
[`docs/agents/extension.md`](../../../../docs/agents/extension.md), Captions and the video.

The page is `https://www.youtube.com/watch?v=<id>`, also when YouTube moves to it without loading
a page. No other YouTube page, and no other site, is followed.

## Captions

| Behavior | Check |
| --- | --- |
| Opening a video asks YouTube twice, once for the video's player and once for its Japanese track, and gives its lines through the core's rules: no sound tags, no empty lines. | `src/captions/youtube-requests.test.ts`, `src/video/youtube-page.interaction.test.tsx` |
| Seeking, moving between lines, Repeat, and a speed change ask YouTube nothing. | `src/video/youtube-page.interaction.test.tsx` |
| A video's lines are kept for the browser session, per tab: reloading the video, leaving it and coming back with no other video between, or the service worker starting again, asks nothing. Each other video the tab moves to is asked for once, also one it showed before another. | `src/captions/captions-service.test.ts`, `src/video/youtube-page.interaction.test.tsx` |
| A video with no Japanese track, or one with no spoken line, gives No Japanese Captions, without asking for a track. | `src/captions/youtube-requests.test.ts`, `src/captions/captions-service.test.ts` |
| A track is only ever asked for on `www.youtube.com`, and never translated. | `src/captions/youtube-requests.test.ts` |
| A failure has its reason: the video didn't open, YouTube couldn't be reached, it refused the captions, they couldn't be read, Zenbu couldn't get ready to ask, in which case nothing is asked, or Zenbu couldn't keep the captions it got. A failed video is asked for again only by Try again. | `src/captions/youtube-requests.test.ts`, `src/captions/captions-service.test.ts` |
| A request YouTube leaves unanswered for 15 seconds fails as YouTube not reached, and the other tabs' requests go on. | `src/captions/youtube-requests.test.ts`, `src/captions/captions-service.test.ts` |
| With Zenbu Captions off in Settings, opening a video asks nothing until the Video tab asks for its captions, and each next video in that tab waits, too, until the Video tab asks for it. Turning them on asks for each video still open. | `src/captions/captions-service.test.ts`, `src/video/youtube-page.interaction.test.tsx` |

## When YouTube says no

When YouTube answers that the network is sending too many requests (429), the video's captions
say so: "YouTube isn't sending captions to your network right now. Zenbu will try again in 17
minutes." Then:

| Behavior | Check |
| --- | --- |
| No request goes to YouTube, from any tab, for 15 minutes, then 30, then 60 after each refusal in a row, each up to a fifth longer, and 60 from then on. Once a video's lines come, the waits start over at 15. | `src/captions/captions-service.test.ts` |
| Once the wait is over, the open video is asked for again, and one tab's request answers for every tab waiting. Nothing is asked for a tab whose video was closed. | `src/captions/captions-service.test.ts`, `src/video/youtube-page.interaction.test.tsx` |
| Try again asks once, at any time. | `src/captions/captions-service.test.ts` |
| The waits last for the browser session, also when Chrome stops the service worker. | `src/captions/captions-service.test.ts` |
| With Zenbu Captions off, a watch page the Video tab hasn't asked about is given no wait, and asks nothing more once a wait is over, also one that began while they were on. | `src/captions/captions-service.test.ts`, `src/video/youtube-page.interaction.test.tsx` |

## Following the video

| Behavior | Check |
| --- | --- |
| The extension starts following the video only when a Video tab opens for the tab, something asks it to control the video, or the caption on the player shows, and stops on leaving it. While the caption shows, it keeps following after the last Video tab closes. | `src/video/youtube-page.interaction.test.tsx`, `src/video/youtube-page-captions.interaction.test.tsx` |
| While a Video tab is open for the tab, the page sends it the video's playback, at most ten times a second while it plays and at once on any other change, and nothing once the last one closes. On leaving a video it says there is none, then sends the next video's. | `src/video/youtube-page.interaction.test.tsx`, `src/video/video-tab-port.test.ts` |
| It knows the time, whether the video plays, and its speed, and seeks, plays, pauses, and sets the speed of YouTube's own video. | `src/video/youtube-follower.interaction.test.tsx` |
| It knows which line is playing, from its start up to its end, and that none is between lines. | `src/video/follower.test.ts` |
| While an ad shows, no line is playing, the time holds where the video was, nothing plays, and the controls do nothing. After the ad, the learner's speed, such as 0.75×, comes back. | `src/video/follower.test.ts`, `src/video/youtube-follower.interaction.test.tsx` |
| It can hide YouTube's own captions on the player, and show them again. | `src/video/youtube-follower.interaction.test.tsx` |
| It waits for the player when YouTube hasn't drawn it yet. | `src/video/youtube-follower.interaction.test.tsx` |

## Not checked yet

The agent Chrome harness's stand-in watch page under YouTube's host, with a local muted video,
is where the browser tests check the caption on the player (`e2e/player-captions.spec.ts`). No
run on YouTube itself checks any of it.
