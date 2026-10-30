# The extension's captions and video

How the browser extension gets a YouTube or Netflix video's captions and follows the video on the
page. The rest of the extension's guide is in [`extension.md`](extension.md); Netflix's own parts
are under Netflix, below.

Each site's content script (`src/content/youtube.ts`, `netflix.ts`) gives `startVideoContent` its
`VideoSitePage` (`src/video/video-sites.ts`): its name, its follower, the event that says it moved
to another video (YouTube's `yt-navigate-finish`, Netflix's Navigation API
`currententrychange`), and, for Netflix, where the tracks come from. `followVideoPage`
(`video-page.ts`) does the rest for both: it reads the video from the URL (`watchedVideo`) at
start, on that event, and on `popstate`, and sends `{ type: 'video-opened', site, videoId }`
through `askCaptions`. A page asks for a tab's captions with `{ type: 'captions', tabId }` and
`{ type: 'try-again', tabId }`. The service worker answers each with a `CaptionsState`, `{ state:
'no-video' }` when the tab's URL (`chrome.tabs.get`, through the host permission) isn't a watch
page, or a Failure, and announces each change of a tab's state as `{ target: 'captions', tabId,
captions }`, to the extension's pages and to that tab. For this the manifest asks for `storage`,
`declarativeNetRequestWithHostAccess`, `https://www.youtube.com/*`, `https://www.netflix.com/*`,
and Netflix's track servers, `https://*.oca.nflxvideo.net/*`. The tab's stored video carries its
site, and only YouTube's requests take the queue, the 429 waits, and the `Origin` rule below.

- **YouTube's two requests** go from the service worker: the `ANDROID` player request to
  `/youtubei/v1/player`, then the Japanese track's `timedtext`, with `fmt` and `tlang` dropped,
  only on `www.youtube.com`. The core's rules (`captions/youtube.ts`) pick the track and read it.
  A `declarativeNetRequest` session rule (`originRule`) removes `Origin` from the extension's own
  requests to `www.youtube.com/youtubei/`, as the spike (#945) did: POSTs only, from no tab, and
  with the extension as initiator. The service worker adds it before its first request
  (`prepareRequests`); if Chrome refuses it, no request goes, the video fails with "Zenbu couldn't
  get ready to ask YouTube.", and the next request tries again. The browser tests' stand-in
  YouTube (`e2e/youtube-stand-in.ts`) doesn't look at `Origin`, so whether `initiatorDomains`
  matches the service worker's own requests is unchecked until a run on YouTube itself.
- **A 15-second timeout** (`AbortSignal.timeout`) on each request, so a request YouTube leaves
  unanswered fails as "Zenbu couldn't reach YouTube." and frees the queue for the other tabs.
- **One request at a time.** Every request to YouTube goes through one queue, and each tab's
  requests through its own, so a tab never asks for a video it's already asking for.
- **What it keeps,** in `chrome.storage.session`: each tab's video, its state, and whether the
  Player tab asked (`captions.tab.<id>`), forgotten when the tab closes, and the wait after a 429
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
a Player tab opens, or when the caption on the player shows, and stops it when the video changes.
Both sites' followers are `elementFollower` (`element-follower.ts`) with a `PlayerSite`: the
player's selector, the style rule that hides the site's captions, an ad class, and the controls.
YouTube's (`youtube-follower.ts`) follows `#movie_player`'s `<video>` and sets its time and speed;
Netflix's controls go through Netflix's player (Netflix, below). The follower reports the time frame by frame only while the video plays and someone subscribes,
holds the time and ignores the controls while the player has `ad-showing`, then puts the
learner's speed back, also when the site puts its own back after a seek, and hides the site's
own captions with an attribute on the player and one style rule. `currentLine` (`follower.ts`) finds the line playing at a time, and `playingLine` the
line playing in a `Playback`: none while an ad shows (`ad: true`), whatever the held time. The Player
tab follows with `currentCard` (`panel-line-controls.ts`), not `playingLine`: it keeps the card the
learner moved to, and the first card before the first line starts. `ended` is the `<video>` element's `ended` (false
during an ad); #964 added it (PR #1108, amending the interface) because the core leaves the last
line's end unclamped, so a last line can end after the video does.

## The Player tab's port

The side panel's Player tab follows a tab's playback on a port (`video-tab-port.ts`), straight to
the tab's content script, with no service worker between:

- **It opens** with `chrome.tabs.connect(tabId, { name: 'video-tab', frameId: 0 })` when the
  tab is shown on a watch page, and **closes** with `port.disconnect()` when it is hidden, moves to
  another tab or video, or the panel closes. The connect and the disconnect are the two messages:
  the content script answers no port with another name.
- **The content script sends** `{ target: 'video-tab', playback }` on each open port, a
  `Playback` (`{ videoId, time, playing, rate, ad, ended }`) or `null` when the page has no video: once
  on connecting, then on each change while at least one port is open. It subscribes to the
  follower only then, so nothing is sent, and no frame is read, while no Player tab is open, and
  stops the follower when the last port closes.
- **The throttle:** steady play, the same video at the same speed with no ad, is sent at most
  every 100 ms; a jump of a second or more, a pause, a speed change, an ad, or `null` goes at once.
- **Reconnecting:** a port the page drops, or one no page answers, such as a tab whose content
  script hasn't started, is tried again after 2 seconds, doubling up to 10, and the wait starts
  over on the next message. The panel reads `chrome.runtime.lastError` on each disconnect. A port
  that disconnects with a `lastError` before any message, which is what a tab without the content
  script gives, is reported to the Player tab as `unreachable()` (`Following` in
  `video-tab-port.ts`), and the tab offers Reload (`chrome.tabs.reload`); any message after that
  clears it.

A port, rather than two messages through the service worker, makes the close certain: Chrome
disconnects it when the panel closes or the page goes, which a sent "closed" can't promise. The
Player tab still asks for captions through the service worker (`captions`, `try-again`), with
Zenbu Captions on or off, and seeks with a `video` control.

## The caption on the player

`startVideoContent` (`src/content/video-content.ts`) gives `followVideoPage` a `captions` option: the settings (`askSettings`
until it answers, asked again on the next video if it failed, then `onSettingsChanged`) and
`playerCaptions(...)`, which shows a video's lines.

- **When it shows** (`video-page.ts`): the page keeps the first `lines` state the captions
  changes give for the video, so it asks for nothing more, and shows the caption while
  `videos.zenbuCaptions` is on, Zenbu is on for the page's host (`isZenbuOn`), and the video has
  lines: it hides the site's captions (`showSiteCaptions(false)`), then calls
  `show(follower, { videoId, lines }, settings)`. Turning either off stops it and shows the site's captions again, and stops the follower unless a Player tab is
  open; a Player tab closing leaves the follower running while the caption shows. A Player tab's
  seek goes through the caption's `seek`, so Repeat moves with it.
- **Where it draws** (`player-captions.tsx`): one host element, `data-zenbu-player-captions`, in
  `follower.captionHost()` once the follower has one, absolutely over the whole player with
  `pointer-events: none`, holding `mountInShadowRoot`. It knows no site's selectors, so Netflix's
  follower gives it a host too. The speed menu portals into the surface inside it, so it
  opens inside a fullscreen player. The host (`kept-inside.ts`) stops clicks and pointer and
  mouse presses from reaching the page, and of the keys only Space and Enter, which a focused
  control acts on, and while the speed menu is open its arrow, Home, End, Page, and typed keys.
  Every other key reaches YouTube, so its shortcuts work after a click on a control, and Escape
  always does. The word popup's host gets the same (`wordPopupHost`'s `prepare`), since in
  fullscreen it sits inside the player. While an ad shows it gives the site's captions back
  (`showSiteCaptions(!ad)`).
- **Moving it** (`caption-box.tsx`, `caption-place.ts`, `caption-drag.ts`): the caption and its
  English are two `CaptionBox`es in one layer, `captionRoomClass`, `inset-x-4 inset-y-0` over the
  player: a flex column at the bottom, with an `::after` spacer that puts the boxes at
  `bottom: max(64px, 12%)`, the English under the caption. Each box has its own place, the
  `videos.captionPlace` and `videos.translationPlace` settings (`captionPlaceKeys`), `null` for
  that spot in the column or `{ x, y }`, each a share from 0 to 1 of the free room, the layer's
  size less the box's. A placed box draws `position: absolute; left: x%; top: y%; translate: -x%
  -y%`, so it stays wholly inside at any player or box size with no measuring at draw time, and
  both stay children of the same layer, so a drag that starts never remounts the box. The
  layer and the boxes know no site's selectors, so Netflix's follower gets them too.
  `useCaptionDrag` is a press and hold: a primary-button press marks the box `data-pressed` and
  starts a 280 ms timer (`holdTime`); a move of more than 6 pixels, a leave, or a release first
  lets it go, so a quick click still reaches a word. When the timer fires the box lifts
  (`data-dragging`). It captures the pointer only once the pointer is more than 6 pixels from
  the press, or leaves the box, since Chrome sends the click after a captured release to the
  box, not the word under it; from then every move measures the box and the layer and places the
  box under the pointer by its grip (`caption-place.ts`'s `followed`), so a line of another size
  that runs straight into the last one mid-drag doesn't jump. The click that ends a drag that
  moved the box is eaten, so a hold on a word drags without opening its popup, and a hold that
  never moved it is a click, however long. On release, cancel, the box's own lost capture, or
  the box unmounting mid-drag, it keeps the place through its `keep`; a double-click on a box's
  background keeps `null` for that box.
  `player-captions.tsx` has one stable keeper per key, which puts the place in its settings at
  once and calls the services' `keepCaptionPlaces`, which `video-content.ts`
  gives `askToWriteSettings`; the service worker takes only `captionPlaceKeys` from a content script.
  The side panel header's **Reset Caption Position** writes `captionPlacesReset` and is disabled
  while `captionsMoved` is false. The host stops presses, so YouTube's player hears none, but
  `pointermove` reaches it, so the controls and the popup's pause act as on a hover.
- **The line controls** (`line-controls.ts`) are the one module for Previous, Next, Repeat, Play,
  and the speed, on a `VideoFollower` only. The first playback after one of its own seeks is that
  seek's landing, however far from the target it lands, as is any within 700 ms and 1 s of the
  target; any other jump is the learner's and moves Repeat to that line. It never seeks back on
  its own (Repeat, or a seek into a gap) within 700 ms of its last seek, so Repeat seeks once per
  line end; Previous and Next always seek. An ended video on the last line is that line's end.
  While `playback.videoId` isn't the lines' video, as when the element holds the next video
  before `yt-navigate-finish`, it draws nothing and the controls do nothing. YouTube's follower
  reports the video it was started for, so there that holds only for a follower that reports the
  new one. The tests drive it with a stand-in clock (`src/test/clock-follower.ts`),
  whose `landing` option lands each seek early or late by a set offset.
- **The word popup** is the page lookup's (`wordPopupHost`, with `popupSettings` from
  `src/word-popup/popup-settings.ts`), and the words are Translate's `SourceLine` with a `pick`
  that opens it. `holdForPopups` (`popup-hold.ts`) hears `wordPopupEvents()` and pauses through
  `popupPause` (`src/video/popup-pause.ts`): it plays again on close, or when the caption stops
  with the popup open, only if the video was playing, and a close during a pointer press waits for
  the press to end, so moving from word to word doesn't play it.
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

## Netflix

Netflix's tracks and controls live in its page's own JavaScript, which an isolated content script
can't reach, so Netflix has two content scripts that talk through `CustomEvent`s on `document`
with JSON-string details (`netflix-protocol.ts`).

- **`netflix-player.js`** runs in the page's MAIN world at `document_start`
  (`src/video/netflix-player.ts`). It finds the watched video's session in
  `netflix.appContext.state.playerApp.getAPI().videoPlayer` by `getMovieId`, and answers a tracks
  request: the Japanese and English tracks chosen from `getTimedTextTrackList()` (text only,
  subtitles before closed captions, never forced or none tracks), and each one's file URL, found
  in the session's player in `cadmiumPlayerRepository.playersById`, reading own data properties
  only, never a getter, and first in the object where it last found a track. A track Netflix hasn't
  loaded is turned on with `setTimedTextTrack`, read, and the learner's track put back, or Netflix's
  none track when it showed none. It applies the
  controls with the player's `seek`, `play`, `pause`, and `setPlaybackRate`, never the video's
  `currentTime`, which stops Netflix with M7375. It waits 10 seconds for the player and 5 for a
  track, and reads Netflix's objects only, through `safely`.
- **`netflix.js`** is the isolated content script (`src/content/netflix.ts`): `netflixBridge`
  (`netflix-bridge.ts`) sends the requests and waits 25 seconds for an answer, and the follower
  hides `.player-timedtext` inside `.watch-video--player-view`.
- **The tracks flow:** the service worker asks the tab's top frame with `{ target:
  'captions-tracks', videoId }` (`askTabTracks`), up to 20 times every 500 ms while the content
  script isn't there yet or hasn't opened the video, as when the Player tab asks before
  `document_idle`. `fetchNetflixCaptions` (`netflix-requests.ts`) then fetches each file once,
  without cookies, only from `*.oca.nflxvideo.net`, reads it (`netflix-ttml.ts`), and pairs the
  English through the core's rules (`captions/netflix.ts`). Netflix gets no queue and no 429 wait.
- **English:** a line Netflix's English covers carries it as `translation`; the Player tab and the
  caption show it and ask the Translator only for the lines without, so the model's download is
  offered only when a line needs it.
- **Stand-in:** the agent Chrome harness serves a stand-in Netflix page under `www.netflix.com`
  and the track files under a `*.oca.nflxvideo.net` host, with no request to Netflix
  ([`README.md`](../../apps/extension/agent-chrome/README.md)). The live check on a Netflix title
  is #987's.

## Checks

The unit tests never reach the network: YouTube's answers come from `src/captions/fixtures/`
through a stand-in `fetch`.

- **The requests:** the two requests and the core's rules, No Japanese Captions, each failure, and
  a track on another host refused (`youtube-requests.test.ts`).
- **The service:** one request per video, kept for the session, the waits after a 429 on a fake
  clock, Try again, and Zenbu Captions off (`captions-service.test.ts`).
- **The watch page,** in happy-dom: asking once per video and nothing for seeking, line moves,
  Repeat, or speed, asking again only once the wait is over, and sending playback only to an open
  Player tab (`youtube-page.interaction.test.tsx`, `video-tab-port.test.ts`); the follower's
  controls, ads, the learner's speed, and hiding YouTube's captions
  (`youtube-follower.interaction.test.tsx`).
- **Netflix,** in happy-dom with a stand-in Netflix player (`src/test/netflix-player-stand-in.ts`)
  and saved track files (`src/captions/fixtures/netflix-*.xml`): the tracks chosen and loaded and
  the controls (`netflix-player.interaction.test.tsx`), the follower
  (`netflix-follower.interaction.test.tsx`), the page end to end
  (`netflix-page.interaction.test.tsx`), the requests and the file (`netflix-requests.test.ts`,
  `netflix-ttml.test.ts`), the retry (`serve-captions.test.ts`), and the Player tab
  (`src/video-tab/netflix.interaction.test.tsx`).
- **The caption on the player,** on a stand-in clock for the video: the line controls
  (`line-controls.test.ts`), the boxes' places (`caption-place.test.ts`), the caption and its
  English's box, the press-and-hold drag of each (`caption-drag.interaction.test.tsx`, on fake
  timers), its popup's pause, ads, and the controls' showing
  (`src/player-captions/*.interaction.test.tsx`), and when the watch page shows it
  (`youtube-page-captions.interaction.test.tsx`). In the browser, `e2e/player-captions.spec.ts`
  and `e2e/caption-drag.spec.ts` on the stand-in watch page, through `e2e/watch-page.ts`
  ([`extension-browser-tests.md`](extension-browser-tests.md)).
