# YouTube captions and playback

On a YouTube watch page, the extension gets the video's Japanese captions and follows the video,
so the side panel's Video tab (#963) and the caption on the player (#964) can show them and drive
it. Neither of those is built yet: today nothing on the page or in the side panel shows the lines.
How it's built is in [`docs/agents/extension.md`](../../../../docs/agents/extension.md), Captions
and the video.

The page is `https://www.youtube.com/watch?v=<id>`, also when YouTube moves to it without loading
a page. No other YouTube page, and no other site, is followed.

## Captions

| Behavior | Check |
| --- | --- |
| Opening a video asks YouTube twice, once for the video's player and once for its Japanese track, and gives its lines through the core's rules: no sound tags, no empty lines. | `src/captions/youtube-requests.test.ts`, `src/video/youtube-page.interaction.test.tsx` |
| Seeking, moving between lines, Repeat, and a speed change ask YouTube nothing. | `src/video/youtube-page.interaction.test.tsx` |
| A video's lines are kept for the browser session, per tab: going back to the same video, or the service worker starting again, asks nothing. The next video in the tab is asked for once. | `src/captions/captions-service.test.ts`, `src/video/youtube-page.interaction.test.tsx` |
| A video with no Japanese track, or one with no spoken line, gives No Japanese Captions, without asking for a track. | `src/captions/youtube-requests.test.ts`, `src/captions/captions-service.test.ts` |
| A track is only ever asked for on `www.youtube.com`, and never translated. | `src/captions/youtube-requests.test.ts` |
| A failure has its reason: the video didn't open, YouTube couldn't be reached, it refused the captions, or they couldn't be read. A failed video is asked for again only by Try again. | `src/captions/youtube-requests.test.ts`, `src/captions/captions-service.test.ts` |
| With Zenbu Captions off in Settings, opening a video asks nothing until the Video tab asks for the captions, then once per video in that tab. Turning them on asks for each video still open. | `src/captions/captions-service.test.ts`, `src/video/youtube-page.interaction.test.tsx` |

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

## Following the video

| Behavior | Check |
| --- | --- |
| The extension starts following the video only when something asks it to control the video, and stops on leaving it. | `src/video/youtube-page.interaction.test.tsx` |
| It knows the time, whether the video plays, and its speed, and seeks, plays, pauses, and sets the speed of YouTube's own video. | `src/video/youtube-follower.interaction.test.tsx` |
| It knows which line is playing, from its start up to its end, and that none is between lines. | `src/video/follower.test.ts` |
| While an ad shows, the time holds where the video was, nothing plays, and the controls do nothing. After the ad, the learner's speed, such as 0.75×, comes back. | `src/video/youtube-follower.interaction.test.tsx` |
| It can hide YouTube's own captions on the player, and show them again. | `src/video/youtube-follower.interaction.test.tsx` |
| It waits for the player when YouTube hasn't drawn it yet. | `src/video/youtube-follower.interaction.test.tsx` |

## Not checked yet

A stand-in watch page under YouTube's host, with a local muted video, and one run on YouTube
itself wait for the agent Chrome harness in the repository (#952).
