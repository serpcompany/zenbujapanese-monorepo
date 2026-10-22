import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, here, out } from './launch.mjs';
import { exerciseControls, sleep, waitState } from './checks.mjs';

const port = 18945;
const server = spawn(process.execPath, [join(here, 'netflix-mock/server.mjs')], { env: { ...process.env, PORT: String(port) } });
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(...String(d).trim().split('\n')));
server.stderr.on('data', (d) => serverLog.push(String(d)));
await sleep(3000);

const kind = process.argv[2] ?? 'cft';
const { browser, version } = await launch(kind, [
  `--host-resolver-rules=MAP www.netflix.com 127.0.0.1:${port},MAP mock.nflxvideo.net 127.0.0.1:${port}`,
  '--ignore-certificate-errors',
]);
const page = await browser.newPage();
const logs = [];
const warnings = [];
page.on('console', (m) => {
  if (m.text().startsWith('[zenbu-spike]')) logs.push(m.text());
  if (m.text().startsWith('[mock-netflix]')) warnings.push(m.text());
});
const navStart = Date.now();
await page.goto('https://www.netflix.com/watch/81234567', { waitUntil: 'domcontentloaded' });
const ready = await waitState(page, (s) => s.status === 'ready' || s.status === 'No Japanese Captions', 30000);
const result = { chrome: kind, version, readyAfterMs: Date.now() - navStart, status: ready?.status, netflix: ready?.netflix, cueCount: ready?.cueCount, translationCount: ready?.translationCount };
result.checks = await exerciseControls(page, 16);
result.m7375Warnings = warnings;
result.logs = logs;
result.serverRequests = serverLog.filter((l) => l.includes('timedtext') || l.includes('/watch/'));
await page.screenshot({ path: join(out, `netflix-mock-${kind}.png`) });
writeFileSync(join(out, `netflix-mock-${kind}.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, readyAfterMs: result.readyAfterMs, cues: result.cueCount, en: result.translationCount }));
console.log('netflix', JSON.stringify(result.netflix));
console.log('checks', JSON.stringify(result.checks));
console.log('m7375', JSON.stringify(warnings));
console.log('server', JSON.stringify(result.serverRequests));
await browser.close();
server.kill();
