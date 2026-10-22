import { launch } from '../launch.mjs';

const kind = process.argv[2] ?? 'branded';
const { browser, version } = await launch(kind);
const page = await browser.newPage();
await page.goto('https://example.com');
await page.evaluate(() => {
  const button = document.createElement('button');
  button.id = 'go';
  button.textContent = 'go';
  document.body.append(button);
  window.result = new Promise((resolve) => {
    button.addEventListener('click', async () => {
      const started = performance.now();
      let progress = 0;
      try {
        const translator = await Translator.create({
          sourceLanguage: 'ja',
          targetLanguage: 'en',
          monitor(m) { m.addEventListener('downloadprogress', (e) => { progress = e.loaded; }); },
        });
        const readyMs = Math.round(performance.now() - started);
        const lines = ['傘を持って行きましょう', '駅まで歩きます', '今日は家で過ごす一日を紹介します', 'ふくには二つの意味があります'];
        const times = [];
        const out = [];
        for (const line of lines) {
          const t = performance.now();
          out.push(await translator.translate(line));
          times.push(Math.round(performance.now() - t));
        }
        const batchStart = performance.now();
        await Promise.all(Array.from({ length: 50 }, (_, i) => translator.translate(lines[i % lines.length] + i)));
        resolve({ readyMs, progress, times, out, fiftyLinesMs: Math.round(performance.now() - batchStart), after: await Translator.availability({ sourceLanguage: 'ja', targetLanguage: 'en' }) });
      } catch (error) {
        resolve({ error: String(error), progress, ms: Math.round(performance.now() - started) });
      }
    });
  });
});
await page.click('#go');
const result = await page.evaluate(() => window.result);
console.log(JSON.stringify({ kind, version, headless: !process.env.HEADFUL, ...result }));
await browser.close();
