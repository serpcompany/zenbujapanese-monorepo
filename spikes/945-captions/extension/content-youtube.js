(() => {
  if (location.hostname !== 'www.youtube.com') return;
  const { fromJson3, japaneseTrack } = globalThis.ZenbuCaptions;
  const overlay = globalThis.ZenbuOverlay;
  let loading = null;

  const video = () => document.querySelector('#movie_player video') ?? document.querySelector('video');
  overlay.setPlayer({
    video,
    time: () => video()?.currentTime ?? 0,
    seek: (t) => {
      video().currentTime = t;
    },
    play: () => video().play(),
    pause: () => video().pause(),
    setRate: (r) => {
      video().playbackRate = r;
    },
  });

  function parse(response, joiner) {
    if (response?.status !== 200 || !response.text) return null;
    try {
      return fromJson3(response.text, joiner);
    } catch {
      return null;
    }
  }

  function summary(response) {
    if (!response) return null;
    return { status: response.status, bytes: response.length ?? response.text?.length ?? 0, ms: response.ms };
  }

  function pageTracks(videoId) {
    return new Promise((resolve) => {
      document.addEventListener('zenbu-spike:yt-tracks', (e) => resolve(JSON.parse(e.detail)), { once: true });
      document.dispatchEvent(new CustomEvent('zenbu-spike:yt-get-tracks', { detail: JSON.stringify({ videoId }) }));
    });
  }

  async function pageFetch(url) {
    const start = performance.now();
    try {
      const response = await fetch(url, { credentials: 'include' });
      const text = await response.text();
      return { status: response.status, length: text.length, text, ms: Math.round(performance.now() - start) };
    } catch (error) {
      return { status: 0, text: '', error: String(error) };
    }
  }

  function withParams(url, params) {
    const u = new URL(url, location.href);
    u.searchParams.delete('tlang');
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (!u.searchParams.get('c')) u.searchParams.set('c', 'WEB');
    return u.toString();
  }

  async function routePage(videoId, started) {
    const snap = await pageTracks(videoId);
    const result = {
      route: 'page-player',
      waitedMs: snap.waitedMs,
      adShowing: snap.adShowing,
      tracks: snap.tracks.map(({ url, ...rest }) => rest),
    };
    const track = japaneseTrack(snap.tracks.filter((t) => t.url));
    if (track) {
      result.chosen = { languageCode: track.languageCode, kind: track.kind || 'creator', hasPot: track.hasPot };
      result.ja = await pageFetch(withParams(track.url, { fmt: 'json3' }));
      result.en = await pageFetch(withParams(track.url, { fmt: 'json3', tlang: 'en' }));
    }
    result.arrivedAtMs = Math.round(performance.now() - started);
    return result;
  }

  async function routeAndroid(videoId, started) {
    const result = await chrome.runtime.sendMessage({ type: 'yt-android', videoId });
    result.arrivedAtMs = Math.round(performance.now() - started);
    return result;
  }

  async function routeAndroidFromContentScript(videoId, started) {
    const t0 = performance.now();
    const response = await fetch('/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } }, videoId }),
    });
    const json = await response.json().catch(() => null);
    return {
      route: 'android-content-script',
      playerStatus: response.status,
      playerMs: Math.round(performance.now() - t0),
      tracks: (json?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []).map((t) => `${t.languageCode}${t.kind === 'asr' ? '(asr)' : ''}`),
      arrivedAtMs: Math.round(performance.now() - started),
    };
  }

  async function load() {
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId || loading === videoId) return;
    loading = videoId;
    overlay.mount();
    overlay.setCues([], []);
    overlay.setStatus(`loading ${videoId}`);
    const started = performance.now();
    const navigationMs = Math.round(started);
    const [android, page, contentAndroid] = await Promise.all([
      routeAndroid(videoId, started).catch((e) => ({ route: 'android', error: String(e) })),
      routePage(videoId, started).catch((e) => ({ route: 'page-player', error: String(e) })),
      routeAndroidFromContentScript(videoId, started).catch((e) => ({ route: 'android-content-script', error: String(e) })),
    ]);
    const routes = {};
    for (const r of [android, page, contentAndroid]) {
      routes[r.route] = {
        ...r,
        ja: summary(r.ja),
        en: summary(r.en),
        jaLines: parse(r.ja, '')?.length ?? 0,
        enLines: parse(r.en, ' ')?.length ?? 0,
      };
      overlay.log(r.route, JSON.stringify(routes[r.route]));
    }
    const ja = parse(android.ja, '') ?? parse(page.ja, '') ?? [];
    const en = parse(android.en, ' ') ?? parse(page.en, ' ') ?? [];
    overlay.state.videoId = videoId;
    overlay.state.routes = routes;
    overlay.state.scriptStartedAtMs = navigationMs;
    overlay.state.jaFrom = parse(android.ja, '') ? 'android' : parse(page.ja, '') ? 'page-player' : null;
    overlay.state.enFrom = parse(android.en, ' ') ? 'android' : parse(page.en, ' ') ? 'page-player' : null;
    overlay.setCues(ja, en);
    overlay.log('tracks', `ja from ${overlay.state.jaFrom} (${ja.length} lines), en from ${overlay.state.enFrom} (${en.length} lines)`);
    overlay.setStatus(ja.length ? 'ready' : 'No Japanese Captions');
  }

  document.addEventListener('yt-navigate-finish', () => load());
  load();
})();
