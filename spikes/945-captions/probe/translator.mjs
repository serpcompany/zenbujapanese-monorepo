import { launch } from '../launch.mjs';

const kind = process.argv[2] ?? 'branded';
const { browser, version } = await launch(kind);
const page = await browser.newPage();
await page.goto('https://example.com');
const result = await page.evaluate(async () => {
  if (!('Translator' in self)) return { translator: 'missing' };
  const availability = await Translator.availability({ sourceLanguage: 'ja', targetLanguage: 'en' });
  const detector = 'LanguageDetector' in self ? await LanguageDetector.availability() : 'missing';
  return { translator: availability, languageDetector: detector };
});
console.log(JSON.stringify({ kind, version, headless: !process.env.HEADFUL, ...result }));
await browser.close();
