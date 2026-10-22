const [id, client = 'ANDROID', version = '20.10.38'] = process.argv.slice(2);
const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ context: { client: { clientName: client, clientVersion: version, hl: 'en' } }, videoId: id }),
});
const j = await r.json();
const tracks = j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
console.log('player', r.status, j.playabilityStatus?.status, tracks.map(t => t.languageCode + (t.kind === 'asr' ? '(asr)' : '')).join(','));
const track = tracks.find(t => t.languageCode === 'ja' && t.kind !== 'asr') ?? tracks.find(t => t.languageCode === 'ja');
if (!track) process.exit(0);
const en = tracks.find(t => t.languageCode.startsWith('en') && t.kind !== 'asr');
const tries = [['ja', track.baseUrl, {}], ['ja+tlang=en', track.baseUrl, { tlang: 'en' }], ['ja+tlang=en+fmt=json3', track.baseUrl, { tlang: 'en', fmt: 'json3' }]];
if (en) tries.push(['en track', en.baseUrl, {}]);
for (const [name, base, params] of tries) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u);
  const body = await res.text();
  console.log(name, res.status, body.length, body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160));
}
