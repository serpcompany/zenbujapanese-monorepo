import type { Page } from '@playwright/test'
import { expect, needed, test } from './test'

const onPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

async function openSection(page: Page, name: string) {
  if (onPhone(page)) {
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
    await page.getByRole('banner').getByRole('button', { name: 'Menu' }).click()
    const menu = page.getByRole('dialog', { name: 'Zenbu Japanese' })
    await menu.getByRole('link', { name, exact: true }).click()
    await expect(menu).toBeHidden()
    return
  }
  await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click()
}

test.describe('site header and footer', () => {
  test('the header has no search, and its Dictionary link leads to the search box', async ({
    page
  }) => {
    await page.goto(needed.path)
    await expect(page.getByRole('banner').getByRole('search')).toHaveCount(0)
    await expect(page.getByRole('banner').getByRole('textbox')).toHaveCount(0)
    await openSection(page, 'Dictionary')
    await expect(page).toHaveURL(/\/dictionary\/$/)
    await expect(
      page.getByRole('main').getByRole('textbox', { name: 'Search Japanese or English' })
    ).toBeVisible()
  })

  for (const [name, path] of [
    ['About', '/about/'],
    ['Support', '/support/']
  ]) {
    test(`the header leads to ${name} and marks it current`, async ({ page }) => {
      await page.goto('/')
      await openSection(page, name)
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
      if (onPhone(page)) {
        await page.getByRole('banner').getByRole('button', { name: 'Menu' }).click()
        const menu = page.getByRole('dialog', { name: 'Zenbu Japanese' })
        await expect(menu.getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
        await menu.getByRole('button', { name: 'Close' }).click()
        await expect(menu).toBeHidden()
      } else {
        await expect(
          page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name })
        ).toHaveAttribute('aria-current', 'page')
      }
    })
  }

  test('the footer groups its links under Product, Company, and Policies', async ({ page }) => {
    await page.goto('/')
    const footer = page.getByRole('contentinfo')
    for (const [group, links] of [
      ['Product', ['Dictionary', 'Sources', 'Sitemap']],
      ['Company', ['About', 'Support', 'Contact']],
      [
        'Policies',
        ['Legal', 'Privacy Policy', 'Terms of Use', 'DMCA Copyright Policy', 'Affiliate Disclosure']
      ]
    ] as const) {
      const column = footer.getByRole('navigation', { name: group })
      await expect(column.getByRole('link')).toHaveText([...links])
    }
  })
})
