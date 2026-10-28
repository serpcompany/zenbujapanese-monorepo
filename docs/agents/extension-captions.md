# The extension's captions and video

How the browser extension gets a YouTube video's captions and follows the video on the page. The
rest of the extension's guide is in [`extension.md`](extension.md).

The YouTube content script (`followYouTubePage`) reads the video from the URL at start, on
YouTube's `yt-navigate-finish`, and on `popstate`, and sends `{ type: 'video-opened', videoId }`
through `askCaptions`. A page asks for a tab's captions with `{ type: 'captions', tabId }` and
`{ type: 'try-again', tabId }`. The service worker answers each with a `CaptionsState`, `{ state:
'no-video' }` when the tab's URL (`chrome.tabs.get`, through the host permission) isn't a watch
page, or a Failure, and announces each change of a tab's state as `{ target: 'captions', tabId,
captions }`, to the extension's pages and to that tab. For this the manifest asks for `storage`,
`declarativeNetRequestWithHostAccess`, and `https://www.youtube.com/*`.

- **YouTube's two requests** go from the service worker: the `ANDROID` player request to
  `/youtubei/v1/player`, then the Japanese track's `timedtext`, with `fmt` and `tlang` dropped,
  only on `www.youtube.com`. The core's rules (`captions/youtube.ts`) pick the track and read it.
  A `declarativeNetRequest` session rule (`originRule`) removes `Origin` from the extension's own
  requests to `www.youtube.com/youtubei/`, as the spike (#945) did: POSTs only, from no tab, and
  with the extension as initiator. The service worker adds it before its first request
  (`prepareRequests`); if Chrome refuses it, no request goes, the video fails with "Zenbu couldn't
  get ready to ask YouTube.", and the next request tries again. Whether `initiatorDomains`
  matches the service worker's own requests is for #952's stand-in check, before any request to
  YouTube.
- **A 15-second timeout** (`AbortSignal.timeout`) on each request, so a request YouTube leaves
  unanswered fails as "Zenbu couldn't reach YouTube." and frees the queue for the other tabs.
- **One request at a time.** Every request to YouTube goes through one queue, and each tab's
  requests through its own, so a tab never asks for a video it's already asking for.
- **What it keeps,** in `chrome.storage.session`: each tab's video, its state, and whether the
  Video tab asked (`captions.tab.<id>`), forgotten when the tab closes, and the wait after a 429
  (`captions.rateLimit`), shared by every tab. Chrome stops the service worker when it's idle, so
  nothing lives only in memory but the requests in flight.
- **The waits** (`backoff.ts`): 15, 30, then 60 minutes after each 429 in a row, each up to 20%
  longer at random. The service worker sets no timer: the content script asks again once the
  wait is over, so YouTube is asked only while a watch page is open. It sets its timer only for a
  wait still to come, never for one that is over. Try again asks at once.
- **Zenbu Captions off** (`videos.zenbuCaptions`): `video-opened` answers `loading` and asks
  nothing until a page sends `captions` for that tab. It never hands the content script a wait,
  so that page sets no timer: a tab's stored wait is dropped, and the shared one in
  `captions.rateLimit` still holds for when the captions are asked for. From then on the tab's next videos are
  fetched too. The service worker reads the setting through `settings.ts`, and when Settings
  change with it on, opens each tab's video again (`openVideosAgain`), which asks only for what
  it lacks. The content script reads the settings only for the caption on the player (below).

A page drives the video with `{ target: 'video', control }` sent to the tab (`controls.ts`): seek,
play, pause, or a speed. The content script starts the `VideoFollower` on the first one, when
a Video tab opens, or when the caption on the player shows, and stops it when the video changes. The follower (`youtube-follower.ts`) follows `#movie_player`'s
`<video>`: it reports the time frame by frame only while the video plays and someone subscribes,
holds the time and ignores the controls while the player has `ad-showing`, then puts the
learner's speed back, and hides YouTube's own captions with an attribute on the player and one
style rule. `currentLine` (`follower.ts`) finds the line playing at a time, and `playingLine` the
line playing in a `Playback`: none while an ad shows (`ad: true`), whatever the held time. Every
consumer of a follower uses `playingLine`. Netflix's follower
(#966) implements the same interface.

## The Video tab's port

The side panel's Video tab follows a tab's playback on a port (`video-tab-port.ts`), straight to
the tab's content script, with no service worker between:

- **It opens** with `chrome.tabs.connect(tabId, { name: 'video-tab', frameId: 0 })` when the
  tab is shown on a watch page, and **closes** with `port.disconnect()` when it is hidden, moves to
  another tab or video, or the panel closes. The connect and the disconnect are the two messages:
  the content script answers no port with another name.
- **The content script sends** `{ target: 'video-tab', playback }` on each open port, a
  `Playback` (`{ videoId, time, playing, rate, ad }`) or `null` when the page has no video: once
  on connecting, then on each change while at least one port is open. It subscribes to the
  follower only then, so nothing is sent, and no frame is read, while no Video tab is open, and
  stops the follower when the last port closes.
- **The throttle:** steady play, the same video at the same speed with no ad, is sent at most
  every 100 ms; a jump of a second or more, a pause, a speed change, an ad, or `null` goes at once.
- **Reconnecting:** a port the page drops, or one no page answers, such as a tab whose content
  script hasn't started, is tried again after 2 seconds, doubling up to 10, and the wait starts
  over on the next message. The panel reads `chrome.runtime.lastError` on each disconnect. A port
  that disconnects with a `lastError` before any message, which is what a tab without the content
  script gives, is reported to the Video tab as `unreachable()` (`Following` in
  `video-tab-port.ts`), and the tab offers Reload (`chrome.tabs.reload`); any message after that
  clears it.

A port, rather than two messages through the service worker, makes the close certain: Chrome
disconnects it when the panel closes or the page goes, which a sent "closed" can't promise. The
Video tab still asks for captions through the service worker (`captions`, `try-again`), with
Zenbu Captions on or off, and seeks with a `video` control.

## The caption on the player

`src/content/youtube.ts` gives `followYouTubePage` a `captions` option: the settings (`askSettings`
until it answers, asked again on the next video if it failed, then `onSettingsChanged`) and
`playerCaptions(...)`, which shows a video's lines.

- **When it shows** (`youtube-page.ts`): the page keeps the first `lines` state the captions
  changes give for the video, so it asks for nothing more, and shows the caption while
  `videos.zenbuCaptions` is on and the video has lines: it hides the site's captions
  (`showSiteCaptions(false)`), then calls `show(follower, lines, settings)`. Turning the setting
  off stops it and shows the site's captions again, and stops the follower unless a Video tab is
  open; a Video tab closing leaves the follower running while the caption shows. A Video tab's
  seek goes through the caption's `seek`, so Repeat moves with it.
- **Where it draws** (`player-captions.tsx`): one host element, `data-zenbu-player-captions`, in
  `follower.captionHost()` once the follower has one, absolutely over the whole player with
  `pointer-events: none`, holding `mountInShadowRoot`. It knows no site's selectors, so Netflix's
  follower (#966) can give it a host. The speed menu portals into the surface inside it, so it
  opens inside a fullscreen player. The host stops clicks, pointer and mouse presses, and keys
  from reaching the page, except Escape, so YouTube's click to pause and its shortcuts don't fire
  and the word popup still closes on Escape.
- **The line controls** (`line-controls.ts`) are the one module for Previous, Next, Repeat, Play,
  and the speed, on a `VideoFollower` only. It tells its own seeks from the learner's by the time
  it asked for, so Repeat seeks back once per line end, and a learner's seek moves Repeat to that
  line. The tests drive it with a stand-in clock (`src/test/clock-follower.ts`).
- **The word popup** is the page lookup's (`wordPopupHost`, with `popupSettings` from
  `src/word-popup/popup-settings.ts`), and the words are Translate's `SourceLine` with a `pick`
  that opens it. `holdForPopups` (`popup-hold.ts`) hears `wordPopupEvents()` and pauses through
  `popupPause` (`src/video/popup-pause.ts`), which the Video tab's transcript uses too: it plays
  again on close only if the video was playing, and a close during a pointer press waits for the
  press to end, so moving from word to word doesn't play it.
- **English** (`line-english.ts`) asks `translate` for the line and the next one and keeps each
  answer; `not-available` shows none. The content script never calls `downloadTranslator`.
- **When the controls show** (`presence.ts`): the pointer moving over the player, with a 3-second
  rest, the pointer over the controls, focus from the keyboard (a key down before it, so a click
  doesn't pin them open), a pause, the open menu, and the open popup.
- **No CSS import in a content script.** Vite builds each content script as one IIFE, which adds
  an imported stylesheet to the page's `<head>`. So the reading aids' rules
  (`src/word-detail/reading-aids.css`) come in through `src/styles/shadow.css` and `pages.css`,
  and `e2e/player-captions.spec.ts` checks the watch page's `<head>` gets only the follower's one
  rule.

## Checks

The unit tests never reach the network: YouTube's answers come from `src/captions/fixtures/`
through a stand-in `fetch`.

- **The requests:** the two requests and the core's rules, No Japanese Captions, each failure, and
  a track on another host refused (`youtube-requests.test.ts`).
- **The service:** one request per video, kept for the session, the waits after a 429 on a fake
  clock, Try again, and Zenbu Captions off (`captions-service.test.ts`).
- **The watch page,** in happy-dom: asking once per video and nothing for seeking, line moves,
  Repeat, or speed, asking again only once the wait is over, and sending playback only to an open
  Video tab (`youtube-page.interaction.test.tsx`, `video-tab-port.test.ts`); the follower's
  controls, ads, the learner's speed, and hiding YouTube's captions
  (`youtube-follower.interaction.test.tsx`).
- **The caption on the player,** on a stand-in clock for the video: the line controls
  (`line-controls.test.ts`), the caption, its popup's pause, ads, and the controls' showing
  (`src/player-captions/*.interaction.test.tsx`), and when the watch page shows it
  (`youtube-page-captions.interaction.test.tsx`). In the browser, `e2e/player-captions.spec.ts`
  on the stand-in watch page ([`extension-browser-tests.md`](extension-browser-tests.md)).
