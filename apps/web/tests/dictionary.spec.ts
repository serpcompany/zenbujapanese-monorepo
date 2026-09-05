import { expect, test } from '@playwright/test';

test('sample dictionary boots with the approved reading controls', async ({
  page,
}) => {
  await page.goto('/dictionary');
  await expect(
    page.getByRole('heading', { name: 'Zenbu Dictionary' }),
  ).toBeVisible();
  await expect(
    page.getByRole('searchbox', { name: 'Search dictionary' }),
  ).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Romaji' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Furigana' })).toBeChecked();
});

test('reading aids toggle independently and persist through entry navigation', async ({
  page,
}) => {
  await page.goto('/dictionary?search=taberu');
  await page.getByRole('switch', { name: 'Romaji' }).click();
  await expect(page.getByText('taberu', { exact: true })).toBeHidden();
  await expect(page.locator('rt')).toBeVisible();
  await page.getByRole('link', { name: 'View 食べる entry' }).click();
  await expect(page.getByRole('switch', { name: 'Romaji' })).not.toBeChecked();
  await page.getByRole('switch', { name: 'Furigana' }).click();
  await expect(page.locator('rt')).toBeHidden();
  await page.getByRole('switch', { name: 'Romaji' }).click();
  await expect(page.getByText('taberu', { exact: true })).toBeVisible();
  await expect(page.locator('rt')).toBeHidden();
  await expect(
    page.getByText('Pitch 2', { exact: true }),
  ).toHaveAttribute(
    'aria-label',
    'Pitch accent for たべる, downstep 2, 3 mora',
  );
});

test('homographs keep exact identities and absent frequency remains absent', async ({
  page,
}) => {
  await page.goto('/dictionary?search=橋');
  await expect(page.getByRole('article')).toHaveCount(2);
  await page
    .getByRole('article', { name: '橋 — pons, pons Varolii' })
    .getByRole('link', { name: 'View 橋 entry' })
    .click();
  await expect(page).toHaveURL(/2151440$/);
  await expect(page.getByText('No TUBELEX frequency evidence')).toBeVisible();
  await expect(page.getByRole('article')).toContainText('pons, pons Varolii');
  const response = await page.goto('/dictionary/食べる-2151440');
  await expect(
    page.getByRole('heading', { name: 'This page could not be found.' }),
  ).toBeVisible();
  expect(response?.status()).toBe(404);
});

test('sample search handles English and missing results without overflow', async ({
  page,
}) => {
  await page.goto('/dictionary?search=hello');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText(
    'hello, good day, good afternoon',
  );
  await expect(page.getByText('#386', { exact: true })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  await page.getByRole('searchbox').fill('not-in-sample');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('No sample entries found')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('submitted sample search opens the exact Japanese entry', async ({
  page,
}) => {
  await page.goto('/dictionary');
  await expect(page.getByRole('article')).toHaveCount(4);
  await page.getByRole('searchbox').fill('taberu');
  await expect(page.getByRole('article')).toHaveCount(4);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/search=taberu/);
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByText('#165', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View 食べる entry' }).click();
  await expect(page).toHaveURL(/1358280$/);
  await expect(
    page.getByText(
      '2. to live on (e.g. a salary), to live off, to subsist on',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Do you want to eat?', { exact: true }),
  ).toBeVisible();
});
