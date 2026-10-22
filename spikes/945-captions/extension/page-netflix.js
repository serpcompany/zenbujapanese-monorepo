(() => {
  const reply = (type, detail) => document.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(detail) }));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function api() {
    return globalThis.netflix?.appContext?.state?.playerApp?.getAPI?.();
  }

  function sessionId() {
    const ids = api()?.videoPlayer?.getAllPlayerSessionIds?.() ?? [];
    return ids[ids.length - 1];
  }

  function player() {
    const id = sessionId();
    return id === undefined ? undefined : api()?.videoPlayer?.getVideoPlayerBySessionId?.(id);
  }

  function timedTextUrls() {
    const urls = new Map();
    const root = globalThis.netflix?.appContext?.state?.playerApp?.getState?.()?.videoPlayer?.cadmiumPlayerRepository
      ?.playersById?.[sessionId()];
    if (!root) return urls;
    const seen = new WeakSet();
    const stack = [[root, 0]];
    while (stack.length) {
      const [node, depth] = stack.pop();
      if (!node || typeof node !== 'object' || depth > 20 || seen.has(node)) continue;
      seen.add(node);
      if (node instanceof ArrayBuffer || ArrayBuffer.isView(node)) continue;
      try {
        if (node.type === 'timedtext' && typeof node.trackId === 'string' && typeof node.urls?.[0]?.url === 'string') {
          if (!urls.has(node.trackId)) urls.set(node.trackId, node.urls[0].url);
        }
        for (const key of Object.keys(node)) {
          let value;
          try {
            value = node[key];
          } catch {
            continue;
          }
          if (value && typeof value === 'object') stack.push([value, depth + 1]);
        }
      } catch {}
    }
    return urls;
  }

  function describe(track) {
    return {
      trackId: track.trackId,
      bcp47: track.bcp47,
      displayName: track.displayName,
      rawTrackType: track.rawTrackType,
      isImageBased: !!track.isImageBased,
      isForcedNarrative: !!track.isForcedNarrative,
      isNoneTrack: !!track.isNoneTrack,
    };
  }

  function pick(tracks, language) {
    const usable = tracks.filter(
      (t) => t.bcp47?.toLowerCase().startsWith(language) && !t.isNoneTrack && !t.isForcedNarrative
    );
    const rank = (t) => (t.isImageBased ? 2 : 0) + (t.rawTrackType === 'CLOSEDCAPTIONS' ? 1 : 0);
    return usable.sort((a, b) => rank(a) - rank(b))[0];
  }

  async function waitFor(check, timeoutMs, stepMs = 100) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      const value = check();
      if (value) return value;
      await sleep(stepMs);
    }
    return undefined;
  }

  async function getTracks({ languages }) {
    const started = performance.now();
    const p = await waitFor(() => player(), 30000, 250);
    if (!p) return { error: 'no Netflix player API (netflix.appContext...getAPI().videoPlayer) after 30 s' };
    const list = (await waitFor(() => (p.getTimedTextTrackList?.() ?? []).length && p.getTimedTextTrackList(), 15000)) ?? [];
    const result = {
      movieId: p.getMovieId?.() ?? null,
      playerReadyMs: Math.round(performance.now() - started),
      tracks: list.map(describe),
      playerMethods: Object.keys(Object.getPrototypeOf(p) ?? {}).concat(Object.keys(p)).filter((k) => typeof p[k] === 'function').sort(),
      chosen: {},
    };
    const previous = p.getTimedTextTrack?.();
    let switched = false;
    try {
      for (const language of languages) {
        const track = pick(list, language);
        if (!track) continue;
        const chosen = { ...describe(track) };
        const t0 = performance.now();
        let url = timedTextUrls().get(track.trackId);
        chosen.urlWasInState = !!url;
        if (!url) {
          await p.setTimedTextTrack(track);
          switched = true;
          url = await waitFor(() => timedTextUrls().get(track.trackId), 10000);
        }
        chosen.urlMs = Math.round(performance.now() - t0);
        chosen.url = url ?? null;
        result.chosen[language] = chosen;
      }
    } finally {
      if (switched && previous) await p.setTimedTextTrack(previous);
    }
    result.totalMs = Math.round(performance.now() - started);
    return result;
  }

  document.addEventListener('zenbu-spike:nf-get-tracks', async (e) => {
    try {
      reply('zenbu-spike:nf-tracks', await getTracks(JSON.parse(e.detail)));
    } catch (error) {
      reply('zenbu-spike:nf-tracks', { error: String(error) });
    }
  });

  document.addEventListener('zenbu-spike:nf-cmd', async (e) => {
    const { action, value } = JSON.parse(e.detail);
    const p = player();
    let outcome = 'no player';
    try {
      if (p && action === 'seek') {
        await p.seek(Math.round(value * 1000));
        outcome = 'player.seek';
      } else if (p && action === 'play') {
        await p.play();
        outcome = 'player.play';
      } else if (p && action === 'pause') {
        await p.pause();
        outcome = 'player.pause';
      } else if (p && action === 'rate') {
        if (typeof p.setPlaybackRate === 'function') {
          await p.setPlaybackRate(value);
          outcome = 'player.setPlaybackRate';
        } else outcome = 'no player.setPlaybackRate';
      } else if (p && action === 'time') {
        outcome = String(p.getCurrentTime?.());
      }
    } catch (error) {
      outcome = `threw ${error}`;
    }
    reply('zenbu-spike:nf-result', { action, value, outcome });
  });
})();
