(() => {
  if (location.hostname !== 'www.netflix.com') return;
  const { fromTtml } = globalThis.ZenbuCaptions;
  const overlay = globalThis.ZenbuOverlay;
  let loaded = null;

  const video = () => document.querySelector('video');

  function ask(type, replyType, detail) {
    return new Promise((resolve) => {
      document.addEventListener(replyType, (e) => resolve(JSON.parse(e.detail)), { once: true });
      document.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(detail) }));
    });
  }

  async function command(action, value) {
    const result = await ask('zenbu-spike:nf-cmd', 'zenbu-spike:nf-result', { action, value });
    overlay.log(`netflix ${action}${value === undefined ? '' : ' ' + value} ->`, result.outcome);
    return result.outcome;
  }

  overlay.setPlayer({
    video,
    time: () => video()?.currentTime ?? 0,
    seek: (t) => command('seek', t),
    play: () => command('play'),
    pause: () => command('pause'),
    setRate: async (r) => {
      const outcome = await command('rate', r);
      if (outcome !== 'player.setPlaybackRate') {
        video().playbackRate = r;
        overlay.log('netflix rate via video.playbackRate =', String(video().playbackRate));
      }
    },
  });

  async function track(chosen, joiner) {
    if (!chosen?.url) return { lines: [], note: chosen ? 'no url' : 'no track' };
    let response = await chrome.runtime.sendMessage({ type: 'fetch-text', url: chosen.url });
    overlay.log(`netflix ${chosen.bcp47} track host ${new URL(chosen.url).hostname}: service worker fetch ${response.status} ${response.error ?? ''}`);
    if (response.status !== 200) {
      const start = performance.now();
      try {
        const r = await fetch(chosen.url);
        const text = await r.text();
        response = { status: r.status, text, length: text.length, ms: Math.round(performance.now() - start), via: 'content script' };
      } catch (error) {
        response = { status: 0, text: '', error: String(error) };
      }
      overlay.log(`netflix ${chosen.bcp47} content-script fetch ${response.status} ${response.error ?? ''}`);
    }
    const head = response.text.slice(0, 120).replace(/\s+/g, ' ');
    let lines = [];
    try {
      lines = fromTtml(response.text, joiner);
    } catch (error) {
      return { lines, note: `parse failed ${error}`, status: response.status, head };
    }
    return { lines, status: response.status, bytes: response.length, ms: response.ms, head };
  }

  async function load() {
    const match = location.pathname.match(/^\/watch\/(\d+)/);
    if (!match || loaded === match[1]) return;
    loaded = match[1];
    overlay.mount();
    overlay.setCues([], []);
    overlay.setStatus(`loading netflix ${loaded}`);
    const started = performance.now();
    const info = await ask('zenbu-spike:nf-get-tracks', 'zenbu-spike:nf-tracks', { languages: ['ja', 'en'] });
    if (info.error) return overlay.setStatus(info.error);
    overlay.log(
      'netflix text tracks:',
      info.tracks.map((t) => `${t.bcp47}${t.rawTrackType === 'CLOSEDCAPTIONS' ? '[CC]' : ''}${t.isImageBased ? '[image]' : ''}${t.isForcedNarrative ? '[forced]' : ''}`).join(', ')
    );
    overlay.log('netflix player methods:', info.playerMethods.join(','));
    const ja = await track(info.chosen.ja, '');
    const en = await track(info.chosen.en, ' ');
    const describe = (c, t) => c && { trackId: c.trackId, isImageBased: c.isImageBased, urlWasInState: c.urlWasInState, urlMs: c.urlMs, status: t.status, bytes: t.bytes, lines: t.lines.length, note: t.note, head: t.head };
    overlay.state.netflix = {
      movieId: info.movieId,
      playerReadyMs: info.playerReadyMs,
      trackCount: info.tracks.length,
      languages: info.tracks.map((t) => t.bcp47),
      ja: describe(info.chosen.ja, ja),
      en: describe(info.chosen.en, en),
      arrivedAtMs: Math.round(performance.now() - started),
    };
    overlay.log('netflix result', JSON.stringify(overlay.state.netflix));
    overlay.setCues(ja.lines, en.lines);
    overlay.setStatus(ja.lines.length ? 'ready' : 'No Japanese Captions');
  }

  setInterval(load, 1000);
  load();
})();
