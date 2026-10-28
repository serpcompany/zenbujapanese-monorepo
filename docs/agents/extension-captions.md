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
  it lacks. The content script never reads settings.

A page drives the video with `{ target: 'video', control }` sent to the tab (`controls.ts`): seek,
play, pause, or a speed. The content script starts the `VideoFollower` on the first one and stops
it when the video changes. The follower (`youtube-follower.ts`) follows `#movie_player`'s
`<video>`: it reports the time frame by frame only while the video plays and someone subscribes,
holds the time and ignores the controls while the player has `ad-showing`, then puts the
learner's speed back, and hides YouTube's own captions with an attribute on the player and one
style rule. `currentLine` (`follower.ts`) finds the line playing at a time, and `playingLine` the
line playing in a `Playback`: none while an ad shows (`ad: true`), whatever the held time. Every
consumer of a follower uses `playingLine`. Netflix's follower
(#966) implements the same interface.
