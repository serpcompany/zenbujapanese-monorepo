# Spike for #945: YouTube and Netflix captions without patching the page

Throwaway. Never merged. It answers #945 and nothing more.

`extension/` is an unpacked Chrome MV3 extension. On a YouTube or Netflix watch page it gets the
Japanese and English text tracks, shows the current line in a panel at the top right, and moves
the video: previous and next line, play and pause, repeat line, and speeds 0.5× to 1.5×. It
patches nothing on the page: no `XMLHttpRequest`, `fetch`, `JSON.parse` or `JSON.stringify`.
Every step is logged to the console with the prefix `[zenbu-spike]` and to the panel.

## How it gets the text

- **YouTube**, three routes side by side, so one run compares them:
  - `android`: the service worker asks `youtubei/v1/player` as YouTube's Android client, as the
    app's `YouTubeCaptions.swift` does, then fetches the timed text (`fmt=json3`) and its English
    translation (`tlang=en`). A `declarativeNetRequest` session rule removes the
    `chrome-extension://` Origin header, which YouTube answers with 403.
  - `android-content-script`: the same player request from the content script, whose requests
    carry the page's own origin; it lists the tracks only.
  - `page-player`: a MAIN-world script reads the player's own track list
    (`#movie_player.getAudioTrack().captionTracks`, whose URLs carry YouTube's `pot` token), and
    the content script fetches them. This is asbplayer's first route.
- **Netflix**: a MAIN-world script reads Netflix's player API
  (`netflix.appContext.state.playerApp.getAPI().videoPlayer`) for the track list, and finds each
  track's download URL in the player's state. A track Netflix hasn't downloaded yet is selected
  for a moment so Netflix downloads it, then the learner's own choice is put back. This is how
  asbplayer has done it since 2026-07-03, when Netflix stopped passing its manifest through
  `JSON.parse`. The service worker fetches the IMSC 1.1 (TTML) file.
- **Following playback:** the `<video>` element's `currentTime` is read ten times a second. On
  YouTube the element is also moved directly. On Netflix seeking, playing and pausing go through
  the player API (`player.seek(ms)`, `play()`, `pause()`), since writing `currentTime` makes
  Netflix stop with error M7375; speed is the element's `playbackRate`.

## Run it

`npm install` here, then:

- `node run-youtube.mjs cft AQdI1o2D32I 0jWS7Tbs6kc`: Chrome for Testing 153 with a fresh
  profile under `tmp/agent/`, both YouTube videos, every control. Results go to
  `tmp/agent/verify/945/youtube-cft.json`. `branded` instead of `cft` uses Google Chrome.
- `node run-netflix-mock.mjs cft`: the Netflix route against `netflix-mock/`, a page that
  mimics Netflix's player API and serves two TTML files. Chrome maps `www.netflix.com` and
  `mock.nflxvideo.net` to a local HTTPS server, so nothing reaches Netflix.
- `node parse-test.mjs`: the TTML and json3 parsing, sound tags, and creator-made first.
- `probe/*.mjs`: the plain Node probes behind the rate-limit and Origin findings.

## Netflix, live

Needs Google Chrome (Widevine) signed in to Netflix. In that Chrome: `chrome://extensions`,
Developer mode on, **Load unpacked**, choose `extension/`. Open a Japanese title, play it, and
read the panel or the console (`[zenbu-spike]`). Remove the extension afterwards.
