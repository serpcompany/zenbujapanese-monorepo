const id = process.argv[2] ?? 'AQdI1o2D32I';
for (const origin of [null, 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'https://www.youtube.com']) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST', headers,
    body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: 'en' } }, videoId: id }),
  });
  const text = await r.text();
  console.log(origin, r.status, text.slice(0, 120).replace(/\s+/g, ' '));
}
