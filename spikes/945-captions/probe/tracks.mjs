const ids = process.argv.slice(2);
for (const id of ids) {
  const t0 = performance.now();
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } }, videoId: id }),
  });
  const j = await r.json();
  const tracks = j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  console.log(id, r.status, j.playabilityStatus?.status, JSON.stringify(j.videoDetails?.title), Math.round(performance.now() - t0) + 'ms',
    tracks.map(t => `${t.languageCode}${t.kind === 'asr' ? '(asr)' : ''}${t.isTranslatable ? '*' : ''}`).join(','));
  if (process.env.SHOWURL) console.log(tracks.map(t => t.baseUrl).join('\n'));
}
