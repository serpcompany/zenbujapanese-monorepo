import type { Page } from '@playwright/test'
import { expect, needed, sidewaysOverflow, test } from './test'

const onPhone = () => test.info().project.name === 'phone'

async function openSection(page: Page, name: string) {
  if (onPhone()) {
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
      if (onPhone()) {
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

  test('the header fits a 320-pixel phone, with the site name left to screen readers', async ({
    page
  }) => {
    test.skip(!onPhone(), 'Only a phone is this narrow')
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(needed.path)
    const banner = page.getByRole('banner')
    await expect(banner.getByRole('link', { name: 'Zenbu Japanese' })).toBeVisible()
    await expect(banner.getByText('Zenbu Japanese')).toHaveCSS('position', 'absolute')
    await expect(banner.getByRole('button', { name: 'Get the app' })).toBeInViewport({ ratio: 1 })
    await expect(banner.getByRole('button', { name: 'Menu' })).toBeInViewport({ ratio: 1 })
    expect(await sidewaysOverflow(page), 'The page scrolls sideways').toBeLessThanOrEqual(0)
  })

  test('the phone menu closes when the browser goes back, and stays closed going forward', async ({
    page
  }) => {
    test.skip(!onPhone(), 'The menu is only on phones')
    await page.goto('/')
    await openSection(page, 'About')
    await expect(page).toHaveURL(/\/about\/$/)
    const menuButton = page.getByRole('banner').getByRole('button', { name: 'Menu' })
    await menuButton.click()
    const menu = page.getByRole('dialog', { name: 'Zenbu Japanese' })
    await expect(menu).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(menu).toBeHidden()
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    await page.goForward()
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible()
    await expect(menu).toBeHidden()
  })

  test('the phone menu closes when the window widens, and stays closed when it narrows', async ({
    page
  }) => {
    test.skip(!onPhone(), 'The menu is only on phones')
    await page.goto('/')
    const phoneSize = page.viewportSize()
    await page.getByRole('banner').getByRole('button', { name: 'Menu' }).click()
    const menu = page.getByRole('dialog', { name: 'Zenbu Japanese' })
    await expect(menu).toBeVisible()
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(menu).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    if (phoneSize) await page.setViewportSize(phoneSize)
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
    await expect(menu).toBeHidden()
  })
})
