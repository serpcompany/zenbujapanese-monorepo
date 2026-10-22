const query = process.argv[2] ?? '日本語 vlog 一日';
const html = await (await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=ja`)).text();
const ids = [...new Set([...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]))].slice(0, 15);
for (const id of ids) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } }, videoId: id }),
  });
  const j = await r.json();
  const tracks = j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const ja = tracks.filter((t) => t.languageCode.startsWith('ja'));
  const kind = ja.length === 0 ? 'none' : ja.some((t) => t.kind !== 'asr') ? 'creator' : 'auto-only';
  console.log(id, j.playabilityStatus?.status, kind, j.videoDetails?.lengthSeconds + 's', JSON.stringify(j.videoDetails?.title));
}
