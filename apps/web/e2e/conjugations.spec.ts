import { expect, needed, test } from './test'

const table = `${needed.path}conjugations/`

test.describe('conjugation pages', () => {
  test("the table lists each form, linking to the form's page", async ({ page }) => {
    await page.goto(table)
    await expect(page).toHaveTitle(
      `${needed.headword} (${needed.reading}) conjugation | Zenbu Japanese`
    )
    await expect(page.getByRole('heading', { level: 1, name: 'Conjugations' })).toBeVisible()
    const past = page.getByRole('link', { name: /^Past, 要った, いった$/ })
    await expect(past).toHaveAttribute('href', decodeURI(`${table}plain/past/`))
    await past.click()
    await expect(page).toHaveURL(`${table}plain/past/`)
    await expect(page.getByRole('heading', { level: 1, name: 'Past' })).toBeVisible()
  })

  test('the Polite tab keeps its register in the address and links Polite forms', async ({
    page
  }) => {
    await page.goto(table)
    await page.getByRole('tab', { name: 'Polite' }).click()
    await expect(page).toHaveURL(`${table}#polite`)
    await expect(page.getByRole('link', { name: /^Past, / })).toHaveAttribute(
      'href',
      decodeURI(`${table}polite/past/`)
    )
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Polite' })).toHaveAttribute('aria-selected', 'true')
  })

  test("a form's page names its word and table in the breadcrumb, and lists its examples", async ({
    page
  }) => {
    await page.goto(`${table}plain/past/`)
    await expect(page).toHaveTitle(`要った (いった): past of ${needed.headword} | Zenbu Japanese`)
    const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' })
    await expect(breadcrumb.getByRole('link', { name: 'Conjugations' })).toHaveAttribute(
      'href',
      decodeURI(table)
    )
    await expect(
      page.getByRole('main').getByRole('listitem').filter({ hasText: 'Tatoeba' }).first()
    ).toBeVisible()
  })
})
