import type { Page } from '@playwright/test'
import { expect, needed, sourcesToggle, test } from './test'

const examples = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Pronounce sentence' }) })

test.describe('word page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(needed.path)
  })

  test('shows the word, its breadcrumb, and its meaning', async ({ page }) => {
    await expect(page).toHaveTitle(
      `${needed.headword} (${needed.reading}) meaning | Zenbu Japanese`
    )
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toHaveCount(1)
    await expect(heading).toHaveAccessibleName(needed.headword)
    expect(await heading.evaluate(element => element.textContent)).toBe(needed.headword)
    const reading = heading.locator('rt [data-reading]')
    await expect(reading).toHaveAttribute('data-reading', 'い')
    expect(await reading.evaluate(element => getComputedStyle(element, '::before').content)).toBe(
      '"い"'
    )
    const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' })
    await expect(breadcrumb.getByRole('link', { name: 'Dictionary' })).toHaveAttribute(
      'href',
      '/dictionary/'
    )
    await expect(page.getByRole('main')).toContainText('to be needed, to be necessary')
  })

  test('puts Share and More actions at the end of the breadcrumb row', async ({ page }) => {
    const breadcrumb = await page.getByRole('navigation', { name: 'breadcrumb' }).boundingBox()
    const share = await page.getByRole('button', { name: 'Share', exact: true }).boundingBox()
    const more = await page.getByRole('button', { name: 'More actions', exact: true }).boundingBox()
    const card = await page
      .locator('[data-slot="card"]', { has: page.getByRole('heading', { level: 1 }) })
      .boundingBox()
    if (!breadcrumb || !share || !more || !card) throw new Error('the toolbar is not on the page')
    const middle = breadcrumb.y + breadcrumb.height / 2
    expect(share.y).toBeLessThan(middle)
    expect(share.y + share.height).toBeGreaterThan(middle)
    expect(share.x).toBeGreaterThan(breadcrumb.x + breadcrumb.width)
    expect(share.y + share.height).toBeLessThan(card.y)
    expect(more.x + more.width).toBeCloseTo(card.x + card.width, 0)
  })

  test('loads more examples when the list reaches its end, then has no more', async ({ page }) => {
    await expect(examples(page)).toHaveCount(25)
    await page.getByRole('button', { name: 'Load more examples' }).scrollIntoViewIfNeeded()
    await expect(examples(page)).toHaveCount(50)
    await expect(page.getByRole('button', { name: 'Load more examples' })).toHaveCount(0)
  })

  test('credits no single example, and keeps its Sources closed until opened', async ({ page }) => {
    await expect(examples(page).first()).toBeVisible()
    await expect(examples(page).filter({ hasText: 'Tatoeba' })).toHaveCount(0)
    const tatoeba = page.getByRole('main').getByRole('link', { name: 'Tatoeba', exact: true })
    await expect(tatoeba).toBeHidden()
    await sourcesToggle(page).click()
    await expect(tatoeba).toBeVisible()
    await expect(tatoeba).toHaveAttribute('href', 'https://tatoeba.org/')
  })

  test('the part of speech opens the Conjugations section, again after it closes', async ({
    page
  }) => {
    const conjugations = page
      .getByRole('heading', { level: 2, name: 'Conjugations' })
      .getByRole('button', { name: 'Conjugations' })
    const partOfSpeech = page.getByRole('link', { name: /shows conjugations$/ })
    await expect(conjugations).toHaveAttribute('aria-expanded', 'false')
    await expect(partOfSpeech).toHaveAttribute('href', '#conjugations')
    await partOfSpeech.click()
    await expect(page).toHaveURL(`${needed.path}#conjugations`)
    await expect(conjugations).toHaveAttribute('aria-expanded', 'true')
    await expect(
      page.getByRole('button', { name: 'Past, 要った, いった', exact: true })
    ).toBeVisible()

    await conjugations.click()
    await expect(conjugations).toHaveAttribute('aria-expanded', 'false')
    await partOfSpeech.click()
    await expect(conjugations).toHaveAttribute('aria-expanded', 'true')
  })

  test('opens Frequency Details from a frequency row', async ({ page }) => {
    await page.getByRole('button', { name: 'JLPT level N5' }).click()
    const details = page.getByRole('dialog', { name: 'Frequency Details' })
    await expect(details.getByRole('heading', { name: 'JLPT Levels' })).toBeVisible()
    await details.getByRole('button', { name: 'Done' }).click()
    await expect(details).toHaveCount(0)
  })

  test("opens the More actions menu with the app's actions", async ({ page }) => {
    await page.getByRole('button', { name: 'More actions' }).click()
    const menu = page.getByRole('menu', { name: 'More actions' })
    for (const item of ['Mark as Known', 'Add to List…', 'Open in App', 'Copy Link']) {
      await expect(menu.getByRole('menuitem', { name: item })).toBeVisible()
    }
    await menu.getByRole('menuitem', { name: 'Add to List…' }).click()
    const prompt = page.getByRole('dialog', { name: 'Add to List works in the app' })
    await expect(prompt.getByRole('button', { name: 'Get the app' })).toBeVisible()
    await expect(prompt).toContainText(
      'add notes and photos in the Zenbu app. This website doesn’t save these yet.'
    )
  })

  test('copies the link from the More actions menu', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Copy Link' }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      new URL(needed.path, baseURL).href
    )
  })

  test('opens and closes a kanji in the Kanji section', async ({ page }) => {
    const kanji = page.getByRole('button', { name: '要, need, main point, shows kanji details' })
    const strokeOrder = page.getByRole('button', { name: 'Show stroke order for 要' })
    await kanji.click()
    await expect(kanji).toHaveAttribute('aria-expanded', 'true')
    await expect(strokeOrder).toBeVisible()
    await kanji.click()
    await expect(kanji).toHaveAttribute('aria-expanded', 'false')
    await expect(strokeOrder).toBeHidden()
  })
})

test("a word's #examples opens the page at its Examples section", async ({ page }) => {
  await page.goto(`${needed.path}#examples`)
  await expect(examples(page).first()).toBeInViewport()
})
