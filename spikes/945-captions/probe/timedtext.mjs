const [id, rounds = '1'] = process.argv.slice(2);
async function player() {
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } }, videoId: id }),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}
function variant(base, fmt, tlang) {
  const u = new URL(base);
  u.searchParams.delete('fmt'); u.searchParams.delete('tlang');
  if (fmt) u.searchParams.set('fmt', fmt);
  if (tlang) u.searchParams.set('tlang', tlang);
  return u.toString();
}
const results = [];
for (let i = 0; i < Number(rounds); i++) {
  const t0 = performance.now();
  const p = await player();
  const tracks = p.json?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const ja = tracks.filter(t => t.languageCode === 'ja' || t.languageCode.startsWith('ja-'));
  const track = ja.find(t => t.kind !== 'asr') ?? ja[0];
  const t1 = performance.now();
  if (!track) { results.push({ i, player: p.status, tracks: 0 }); continue; }
  const out = { i, player: p.status, playerMs: Math.round(t1 - t0), kind: track.kind ?? 'creator' };
  for (const [name, fmt, tlang] of [['xml', null, null], ['json3', 'json3', null], ['en', null, 'en']]) {
    const s = performance.now();
    const r = await fetch(variant(track.baseUrl, fmt, tlang));
    const body = await r.text();
    out[name] = `${r.status}/${body.length}b/${Math.round(performance.now() - s)}ms`;
    if (i === 0 && process.env.SHOW) console.log(name, body.slice(0, 300).replace(/\n/g, ' '));
  }
  out.totalMs = Math.round(performance.now() - t0);
  results.push(out);
}
for (const r of results) console.log(JSON.stringify(r));
