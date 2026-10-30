# Netflix captions and playback

On a Netflix watch page, the extension gets the video's Japanese lines and Netflix's own English
and follows the video, as it does on YouTube ([`youtube-captions.md`](youtube-captions.md)), so
the side panel's Player tab ([`video-tab.md`](video-tab.md)) and the caption on the player
([`player-captions.md`](player-captions.md)) show them and drive it with no Netflix code of their
own. How it's built is in
[`extension-captions.md`](../../../../docs/agents/extension-captions.md), Netflix.

The page is `https://www.netflix.com/watch/<id>`, also when Netflix moves to it without loading a
page. A video's ID is Netflix's, and stays in the browser. Netflix's player, its tracks, and the
elements below are Netflix's internals, read and never patched; none is a documented contract.

The tests named here are in `src/video/` unless a path says otherwise. `netflix-page` is
`netflix-page.interaction.test.tsx`, on the real captions service and watch page with a stand-in
Netflix player and a saved Netflix track file.

## Captions

| Behavior | Check |
| --- | --- |
| The Japanese track is a Japanese text track Netflix lists: never an image-based, forced-narrative, or none track; subtitles before closed captions. Netflix's English is an English track by the same rules, or none. | `netflix-player.interaction.test.tsx`: "takes text subtitles before closed captions…", "never takes the off track…" |
| A track Netflix has loaded is used as it is. Only for one it hasn't does the page turn it on with Netflix's own player, and puts the learner's track back at once, also when the learner had subtitles off, or Netflix showed no track and lists its off track once one shows. | `netflix-player.interaction.test.tsx`: "loads only the tracks Netflix hasn't…", "turns captions back off after loading them…", "turns captions back off for a learner Netflix shows no track for…"; netflix-page: "reads the tracks from Netflix's player…" |
| Each track's file is fetched once per video, from Netflix's servers (`*.oca.nflxvideo.net`), and never on a control. | netflix-page: "reads the tracks…"; `src/captions/netflix-requests.test.ts`: "fetches the Japanese and English tracks once…", "…without asking a host it does not trust" |
| The file's times become seconds, and its ruby readings go: 今日 is a line's text, never 今日きょう. | `src/captions/netflix-ttml.test.ts`: "gives the saved Japanese track's lines in seconds, without ruby readings" |
| A sound in full-width parentheses, such as （鳥の声）, is dropped from Netflix's lines only. A YouTube line keeps it, since Japanese also puts readings in them, as in 漢字（かんじ）. | `packages/dictionary-core/src/captions/netflix.test.ts` |
| Each line's English is Netflix's English line over it, paired by the core's rules. | `src/captions/netflix-requests.test.ts`: "…pairs Netflix's English with the lines"; netflix-page: "draws the line on Netflix's player with Netflix's English…" |
| A video with no Japanese text track gives No Japanese Captions. A player Netflix hasn't drawn within 10 seconds, a page whose script isn't there yet after 10 seconds, or a track whose file Netflix doesn't give, fails with why, and Try again. | `netflix-player.interaction.test.tsx`: "says when the video has no Japanese text subtitles…"; `src/captions/netflix-requests.test.ts`: "names Netflix when it refuses the track…"; `src/captions/serve-captions.test.ts`: "asks again while the tab's content script isn't there yet…" |
| Moving to another video asks for its lines; leaving the watch page gives No Video on This Tab. | netflix-page: "asks for the next video when Netflix moves to it…" |

## Following the video

| Behavior | Check |
| --- | --- |
| Seeking, playing, pausing, and the speed go through Netflix's own player. The page never sets the video's time, which stops Netflix with error M7375. | `netflix-follower.interaction.test.tsx`: "follows Netflix's video and drives it through Netflix's player…"; netflix-page: "seeks, plays, and sets the speed…" |
| A speed the learner set, such as 0.75×, stays after a seek: if Netflix puts it back to 1× within a second of the seek, the page sets it again. A load that cuts a seek short ends that, so the learner's next speed is theirs. On YouTube the page never puts a speed back ([`youtube-captions.md`](youtube-captions.md)). | `netflix-follower.interaction.test.tsx`: "keeps the learner's 0.75x when Netflix puts its own speed back after a seek", "takes the learner's next speed after a load cuts a seek short" |
| When Netflix swaps in another player or video, such as for the next episode, the caption moves to the new player, Netflix's subtitles stay hidden there, the learner's speed is set on it, and its time and speed are followed. | `netflix-follower.interaction.test.tsx`: "follows the player and video Netflix swaps in…" |
| While the caption on the player shows, Netflix's own subtitles are hidden by a style rule, which holds when Netflix draws them again; with Zenbu Captions off they show again. | `netflix-follower.interaction.test.tsx`: "hides Netflix's captions on the player while asked…"; netflix-page: "draws the line on Netflix's player…" |
| The Player tab's title is the tab's own without " - Netflix". | `src/video-tab/netflix.interaction.test.tsx`: "takes the title from the tab…" |

## Checked in Chrome

On the agent Chrome harness's stand-in Netflix page, under `www.netflix.com` and a Netflix track
server by host mapping, with no request to Netflix: the Player tab follows playback, a row's click
seeks through the player, the caption and its controls play, pause, and set 0.75×, which stays
after the stand-in puts the speed back to 1× on a seek, and Netflix's subtitles hide while Zenbu
Captions is on and come back when it's off (#966). The stand-in copies the elements this page
assumes; the live check on a Netflix title is #987's.

## Not handled yet

Ads on Netflix: the page never treats a moment as an ad. Netflix's elements and player calls are
unchecked on Netflix itself until #987.
