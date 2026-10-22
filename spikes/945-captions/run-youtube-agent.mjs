import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { out } from './launch.mjs';
import { exerciseControls, sleep, state, waitState } from './checks.mjs';

const harness = process.env.AGENT_CHROME ?? join(homedir(), 'dev/repos/zenbujapanese-monorepo/tmp/agent/agent-chrome');
const { connect } = await import(join(harness, 'connect.mjs'));
const { browser, state: chrome } = await connect();
const ids = process.argv.slice(2);
const results = { chrome: await browser.version(), headless: chrome.headless, videos: [] };

for (const id of ids) {
  const page = await browser.newPage();
  const started = Date.now();
  await page.goto(`https://www.youtube.com/watch?v=${id}`, { waitUntil: 'domcontentloaded' });
  const ready = await waitState(page, (s) => s.status === 'ready' || s.status === 'No Japanese Captions', 45000);
  const video = { id, readyAfterMs: Date.now() - started, status: ready?.status, jaFrom: ready?.jaFrom, enFrom: ready?.enFrom, cues: ready?.cueCount, en: ready?.translationCount };
  video.routes = Object.fromEntries(Object.entries(ready?.routes ?? {}).map(([k, r]) => [k, { ja: r.ja?.status ?? null, en: r.en?.status ?? null, jaLines: r.jaLines, enLines: r.enLines }]));
  const onDevice = await page.waitForSelector('#zenbu-spike button::-p-text(on-device en)', { timeout: 5000 }).catch(() => null);
  if (onDevice) await onDevice.click();
  if (ready?.status === 'ready') {
    video.checks = await exerciseControls(page, 30);
    const s = await state(page);
    video.translator = { readyMs: s.onDeviceReadyMs ?? null, lastLineMs: s.onDeviceLastMs ?? null, line: s.text, translation: s.translation, from: s.translationFrom };
  }
  await sleep(500);
  await page.screenshot({ path: join(out, `youtube-agent-${id}.png`) });
  results.videos.push(video);
  await page.close();
}
writeFileSync(join(out, 'youtube-agent.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 1));
await browser.disconnect();
