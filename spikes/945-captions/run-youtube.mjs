import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, out } from './launch.mjs';
import { exerciseControls, sleep, waitState } from './checks.mjs';

const kind = process.argv[2] ?? 'cft';
const ids = process.argv.slice(3);
const { browser, extensionId, version } = await launch(kind);
const results = { chrome: kind, version, extensionId, videos: [] };

for (const id of ids) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const logs = [];
  page.on('console', (m) => m.text().startsWith('[zenbu-spike]') && logs.push(m.text()));
  const navStart = Date.now();
  await page.goto(`https://www.youtube.com/watch?v=${id}`, { waitUntil: 'domcontentloaded' });
  const ready = await waitState(page, (s) => s.status === 'ready' || s.status === 'No Japanese Captions', 45000);
  const video = {
    id,
    readyAfterMs: Date.now() - navStart,
    status: ready?.status,
    jaFrom: ready?.jaFrom,
    enFrom: ready?.enFrom,
    cueCount: ready?.cueCount,
    translationCount: ready?.translationCount,
    routes: ready?.routes,
    scriptStartedAtMs: ready?.scriptStartedAtMs,
  };
  if (ready && !process.env.NO_CONTROLS) {
    const adStart = Date.now();
    while (Date.now() - adStart < 60000) {
      const ad = await page.evaluate(() => document.getElementById('movie_player')?.classList.contains('ad-showing'));
      if (!ad) break;
      await page.evaluate(() => document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern')?.click());
      await sleep(1000);
    }
    video.adWaitMs = Date.now() - adStart;
    video.checks = await exerciseControls(page, 30);
    await page.screenshot({ path: join(out, `youtube-${kind}-${id}.png`) });
  }
  video.logs = logs.slice(0, 80);
  results.videos.push(video);
  await page.close();
}
writeFileSync(join(out, `youtube-${kind}.json`), JSON.stringify(results, null, 2));
for (const v of results.videos) {
  console.log(JSON.stringify({ id: v.id, status: v.status, readyAfterMs: v.readyAfterMs, scriptStartedAtMs: v.scriptStartedAtMs, jaFrom: v.jaFrom, enFrom: v.enFrom, cues: v.cueCount, en: v.translationCount, adWaitMs: v.adWaitMs }));
  for (const [route, r] of Object.entries(v.routes ?? {})) {
    const { title, tracks, ...rest } = r;
    console.log('  ', route, JSON.stringify({ ...rest, tracks: Array.isArray(tracks) ? tracks.length : tracks }));
  }
  console.log('   checks', JSON.stringify(v.checks));
}
console.log('chrome', kind, version);
await browser.close();
