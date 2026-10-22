(() => {
  function snapshot() {
    const player = document.getElementById('movie_player');
    const data = player?.getVideoData?.();
    const tracks = player?.getAudioTrack?.()?.captionTracks ?? [];
    return {
      videoId: data?.video_id ?? null,
      title: data?.title ?? null,
      adShowing: !!player?.classList?.contains('ad-showing'),
      tracks: tracks.map((t) => ({
        languageCode: t.languageCode,
        kind: t.kind ?? '',
        url: t.url ?? t.baseUrl ?? null,
        hasPot: !!(t.url && new URL(t.url, location.href).searchParams.get('pot')),
      })),
    };
  }

  document.addEventListener('zenbu-spike:yt-get-tracks', (e) => {
    const { videoId, timeoutMs = 15000 } = JSON.parse(e.detail);
    const started = performance.now();
    const poll = () => {
      const snap = snapshot();
      const ready = snap.videoId === videoId && snap.tracks.some((t) => t.hasPot);
      if (ready || performance.now() - started > timeoutMs) {
        snap.waitedMs = Math.round(performance.now() - started);
        document.dispatchEvent(new CustomEvent('zenbu-spike:yt-tracks', { detail: JSON.stringify(snap) }));
      } else setTimeout(poll, 100);
    };
    poll();
  });
})();
