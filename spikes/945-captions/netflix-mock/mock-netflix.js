(() => {
  const video = document.querySelector('video');
  const sessionId = 'watch-mock-1';
  const cdn = 'https://mock.nflxvideo.net/timedtext';
  const tracks = [
    { trackId: 'T:ja', bcp47: 'ja', displayName: '日本語', rawTrackType: 'SUBTITLES', isImageBased: false },
    { trackId: 'T:ja-cc', bcp47: 'ja', displayName: '日本語 [CC]', rawTrackType: 'CLOSEDCAPTIONS', isImageBased: true },
    { trackId: 'T:en', bcp47: 'en', displayName: 'English', rawTrackType: 'SUBTITLES', isImageBased: false },
    { trackId: 'T:off', bcp47: null, displayName: 'Off', isNoneTrack: true },
  ];
  let active = tracks[2];
  let playerSeeking = false;
  const downloaded = [];
  const sessionState = { qx: { r7: { zz: [{ kind: 'media' }], tt: downloaded } } };

  function fetchTrack(track) {
    if (track.isNoneTrack || downloaded.some((d) => d.trackId === track.trackId)) return;
    setTimeout(() => {
      downloaded.push({ type: 'timedtext', trackId: track.trackId, urls: [{ url: `${cdn}/${track.trackId.slice(2)}.ttml?o=1&v=5` }] });
    }, 300);
  }
  fetchTrack(active);

  video.addEventListener('seeking', () => {
    if (!playerSeeking) console.warn('[mock-netflix] direct video.currentTime write: real Netflix shows error M7375 here');
  });

  const player = {
    getMovieId: () => 81234567,
    getTimedTextTrackList: () => tracks,
    getTimedTextTrack: () => active,
    setTimedTextTrack: async (track) => {
      active = track;
      fetchTrack(track);
    },
    seek: (ms) => {
      playerSeeking = true;
      video.currentTime = ms / 1000;
      setTimeout(() => (playerSeeking = false), 50);
    },
    play: () => video.play(),
    pause: () => video.pause(),
    getCurrentTime: () => Math.round(video.currentTime * 1000),
    isPaused: () => video.paused,
  };

  window.netflix = {
    appContext: {
      state: {
        playerApp: {
          getAPI: () => ({
            videoPlayer: {
              getAllPlayerSessionIds: () => [sessionId],
              getVideoPlayerBySessionId: (id) => (id === sessionId ? player : undefined),
            },
          }),
          getState: () => ({ videoPlayer: { cadmiumPlayerRepository: { playersById: { [sessionId]: sessionState } } } }),
        },
      },
    },
  };
})();
