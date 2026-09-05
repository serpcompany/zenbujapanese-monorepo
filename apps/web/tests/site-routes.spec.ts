import { test, expect } from '@playwright/test';

// Independent #279 checklist: deliberately not imported from lib/site/routes.
const expectedPages = [
  ['/', 'Zenbu Japanese', 'Dictionary'],
  ['/about', 'About Zenbu', 'Dictionary sources'],
  ['/contact', 'Contact', 'Sending is not available'],
  ['/support', 'Support', 'Troubleshooting'],
  ['/legal', 'Legal information', 'Privacy policy'],
  ['/legal/privacy', 'Privacy policy', 'Data collected and its purposes'],
  ['/legal/terms', 'Terms of use', 'Acceptable use'],
  ['/legal/dmca', 'Copyright and DMCA', 'Notice requirements'],
  [
    '/legal/affiliate-disclosure',
    'Affiliate disclosure',
    'Whether affiliate links are used',
  ],
  ['/dictionary', 'Zenbu Dictionary', 'to eat'],
  ['/videos', 'Videos', 'Dictionary walkthrough'],
  ['/watch/dictionary-walkthrough', 'Dictionary walkthrough', 'Transcript'],
  ['/blog', 'Blog', 'Behind the dictionary'],
  [
    '/blog/behind-the-dictionary',
    'Behind the dictionary',
    'Article introduction',
  ],
  ['/products', 'Products', 'Zenbu Japanese'],
  ['/products/zenbu-japanese', 'Zenbu Japanese', 'Availability'],
  [
    '/products/zenbu-japanese/features',
    'Zenbu Japanese — Features',
    'Feature overview',
  ],
  [
    '/products/zenbu-japanese/pricing',
    'Zenbu Japanese — Pricing',
    'Pricing not announced',
  ],
  ['/resources', 'Resources', 'Dictionary guide'],
  ['/resources/dictionary-guide', 'Dictionary guide', 'When to use this guide'],
  ['/learn', 'Learn', 'First words'],
  ['/learn/first-words', 'First words', 'Learning objective'],
  ['/sitemap', 'Local route directory', '/legal/affiliate-disclosure'],
  ['/dictionary/食べる-1358280', 'Zenbu Dictionary', 'Do you want to eat?'],
] as const;

for (const locale of ['en', 'ja'] as const) {
  for (const [path, title, purpose] of expectedPages) {
    test(`${locale} ${path} has its intended page purpose`, async ({
      page,
    }) => {
      const url = locale === 'ja' ? `/ja${path === '/' ? '' : path}` : path;
      const response = await page.goto(url);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('h1')).toHaveText(
        locale === 'ja' && path === '/sitemap' ? 'ローカルページ一覧' : title,
      );
      if (!(locale === 'ja' && path === '/'))
        await expect(page.locator('main')).toContainText(purpose);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        /noindex/,
      );
      if (path !== '/' && !path.startsWith('/dictionary')) {
        await expect(page.getByRole('main').getByRole('alert')).toContainText(
          locale === 'ja' ? '内容は未確定' : 'Content not final',
        );
        if (locale === 'ja')
          await expect(page.getByRole('main').getByRole('alert')).toContainText(
            '日本語の本文はまだ用意されていません',
          );
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      if (
        [
          '/',
          '/sitemap',
          '/products',
          '/products/zenbu-japanese/pricing',
          '/blog/behind-the-dictionary',
          '/legal/privacy',
          '/dictionary',
          '/watch/dictionary-walkthrough',
        ].includes(path)
      ) {
        await page.screenshot({
          path: test.info().outputPath('page.png'),
          fullPage: true,
        });
      }
    });
  }
  test(`${locale} unknown dynamic slugs and paths are 404`, async ({
    page,
  }) => {
    for (const path of [
      '/watch/unknown',
      '/blog/unknown',
      '/products/unknown',
      '/products/unknown/features',
      '/products/unknown/pricing',
      '/resources/unknown',
      '/learn/unknown',
      '/legal/unknown',
      '/missing',
    ]) {
      const response = await page.goto(
        `${locale === 'ja' ? '/ja' : ''}${path}`,
      );
      expect(response?.status(), path).toBe(404);
      await expect(page.locator('h1')).toHaveText(
        locale === 'ja'
          ? 'ページが見つかりませんでした。'
          : 'This page could not be found.',
      );
    }
  });
}

test('homepage directory links expose all 23 patterns in the current locale', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Local route directory' }).click();
  await expect(page.locator('.route-directory a')).toHaveCount(23);
  await page.getByRole('combobox').selectOption('ja');
  await expect(page).toHaveURL(/\/ja\/sitemap$/);
  await page
    .locator('.route-directory a')
    .filter({ hasText: 'Product pricing' })
    .click();
  await expect(page).toHaveURL(/\/ja\/products\/zenbu-japanese\/pricing$/);
});

test('locale switching preserves query, entry identity and independent reading aids', async ({
  page,
}) => {
  await page.goto('/dictionary?search=taberu');
  await page.getByRole('switch', { name: 'Romaji' }).click();
  await page.getByRole('combobox').selectOption('ja');
  await expect(page).toHaveURL(/\/ja\/dictionary\?search=taberu$/);
  await expect(
    page.getByRole('switch', { name: 'ローマ字' }),
  ).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'ふりがな' })).toBeChecked();
  await page.getByRole('link', { name: '食べるの項目を見る' }).click();
  await expect(page).toHaveURL(/\/ja\/dictionary\/.+-1358280$/);
  await page.getByRole('combobox').selectOption('en');
  await expect(page).toHaveURL(/:3300\/dictionary\/.+-1358280$/);
  expect(new URL(page.url()).pathname.startsWith('/ja')).toBe(false);
  await expect(page.getByRole('switch', { name: 'Romaji' })).not.toBeChecked();
  await expect(page.getByText('#165', { exact: true })).toBeVisible();
});

test('default-prefix normalization and unsupported locale behavior', async ({
  page,
}) => {
  await page.goto('/en/dictionary?search=hello');
  await expect(page).toHaveURL(/\/dictionary\?search=hello$/);
  expect(new URL(page.url()).pathname).toBe('/dictionary');
  const response = await page.goto('/fr/dictionary');
  expect(response?.status()).toBe(404);
});

test('browser language and remembered explicit choice use next-intl', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'ja-JP' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3300/');
  await expect(page).toHaveURL(/\/ja$/);
  await page.getByRole('combobox').selectOption('en');
  await expect(page).toHaveURL('http://127.0.0.1:3300/');
  await page.goto('http://127.0.0.1:3300/about');
  expect(new URL(page.url()).pathname).toBe('/about');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(
    (await context.cookies()).find((cookie) => cookie.name === 'NEXT_LOCALE')
      ?.value,
  ).toBe('en');
  await context.close();
});

test('Listen uses Japanese browser synthesis and Common marker stays removed', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        cancel() {},
        speak(utterance: SpeechSynthesisUtterance) {
          document.documentElement.dataset.spoken = `${utterance.lang}:${utterance.text}`;
        },
      },
    });
  });
  await page.goto('/dictionary?search=taberu');
  await expect(page.getByText('Common', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-spoken',
    'ja-JP:たべる',
  );
});
