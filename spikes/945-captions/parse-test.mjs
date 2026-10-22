import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, here } from './launch.mjs';

const { browser } = await launch('cft');
const page = await browser.newPage();
await page.addScriptTag({ content: readFileSync(join(here, 'extension/captions.js'), 'utf8') });
const ja = readFileSync(join(here, 'netflix-mock/ja.ttml'), 'utf8');
const json3 = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: '[音楽]' }] }, { tStartMs: 1000, dDurationMs: 3000, segs: [{ utf8: 'こんにちは\n' }, { utf8: '世界' }] }] });
const result = await page.evaluate((ja, json3) => ({
  ttml: ZenbuCaptions.fromTtml(ja).map((c) => `${c.start}-${c.end} ${c.text}`),
  json3: ZenbuCaptions.fromJson3(json3).map((c) => `${c.start}-${c.end} ${c.text}`),
  creatorFirst: ZenbuCaptions.japaneseTrack([{ languageCode: 'ja', kind: 'asr' }, { languageCode: 'ja', kind: '' }]).kind === '',
}), ja, json3);
console.log(JSON.stringify(result, null, 1));
await browser.close();
