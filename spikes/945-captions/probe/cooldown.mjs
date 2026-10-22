const id = process.argv[2] ?? 'AQdI1o2D32I';
const everyMs = Number(process.argv[3] ?? 180000);
const maxMs = Number(process.argv[4] ?? 3600000);
const start = Date.now();
while (Date.now() - start < maxMs) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } }, videoId: id }),
  });
  const j = await r.json();
  const track = (j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []).find((t) => t.languageCode === 'ja');
  const u = new URL(track.baseUrl);
  u.searchParams.delete('fmt');
  const t = await fetch(u);
  console.log(new Date().toISOString(), `+${Math.round((Date.now() - start) / 60000)}min`, 'player', r.status, 'timedtext', t.status);
  if (t.status === 200) break;
  await new Promise((res) => setTimeout(res, everyMs));
}
