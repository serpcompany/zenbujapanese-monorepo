import { expect, needed, test } from './test'

test.describe('kanji page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(encodeURI('/dictionary/kanji/要/'))
  })

  test('shows the kanji, its metrics, and its meanings', async ({ page }) => {
    await expect(page).toHaveTitle('要 kanji meaning | Zenbu Japanese')
    await expect(page.getByRole('heading', { level: 1, name: '要' })).toBeVisible()
    await expect(page.getByRole('main')).toContainText('need, main point, essence, pivot, key to')
    await expect(page.getByRole('definition').first()).toHaveText('9')
  })

  test('opens a word from its readings', async ({ page }) => {
    await page.getByRole('main').getByRole('link', { name: needed.headword, exact: true }).click()
    await expect(page).toHaveURL(needed.path)
    await expect(page.getByRole('heading', { level: 1, name: needed.headword })).toBeVisible()
  })
})
