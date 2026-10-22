const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } }, videoId: process.argv[2] ?? 'AQdI1o2D32I' }),
});
const j = await r.json();
const track = (j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []).find((t) => t.languageCode === 'ja');
for (const host of ['m.youtube.com', 'www.youtube-nocookie.com']) {
  const u = new URL(track.baseUrl);
  u.host = host;
  const t = await fetch(u);
  const body = await t.text();
  console.log(host, t.status, t.headers.get('cache-control'), body.length, body.slice(0, 60).replace(/\s+/g, ' '));
}
