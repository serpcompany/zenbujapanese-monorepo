import type { Page } from '@playwright/test'
import { expect, needed, sidewaysOverflow, test } from './test'

const onPhone = () => test.info().project.name === 'phone'
const desktopOnly = () => test.skip(onPhone(), 'The menus open from the header from 1024 pixels')
const phoneOnly = () => test.skip(!onPhone(), 'Below 1024 pixels the header has a menu button')

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' })
const trigger = (page: Page, name: string) =>
  mainNav(page).getByRole('button', { name, exact: true })
const menuButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Menu' })
const phoneMenu = (page: Page) => page.getByRole('dialog', { name: 'Zenbu Japanese' })

const menus = [
  {
    name: 'Dictionary',
    first: /^Japanese dictionary/,
    link: /^Hiragana/,
    path: /\/dictionary\/browse\/hiragana\/$/,
    panel: (page: Page) => page.locator('body')
  },
  {
    name: 'Company',
    first: /^About$/,
    link: /^Sources$/,
    path: /\/sources\/$/,
    panel: (page: Page) => page.getByRole('list', { name: 'Company' })
  }
] as const

const outsideTheMenus = { x: 8, y: 600 }

test.describe('site header from 1024 pixels', () => {
  test.beforeEach(desktopOnly)

  test('the header has the name, the Dictionary and Company menus, and Get the app, and no search', async ({
    page
  }) => {
    await page.goto(needed.path)
    const banner = page.getByRole('banner')
    await expect(banner.getByRole('link', { name: 'Zenbu Japanese' })).toBeVisible()
    await expect(banner.getByText('Zenbu Japanese')).not.toHaveCSS('position', 'absolute')
    await expect(mainNav(page).getByRole('button')).toHaveText(['Dictionary', 'Company'])
    await expect(banner.getByRole('button', { name: 'Get the app' })).toBeVisible()
    await expect(menuButton(page)).toBeHidden()
    await expect(banner.getByRole('search')).toHaveCount(0)
    await expect(banner.getByRole('textbox')).toHaveCount(0)
  })

  for (const menu of menus) {
    test(`the ${menu.name} menu opens and closes with a click`, async ({ page }) => {
      await page.goto('/legal/terms/')
      const button = trigger(page, menu.name)
      await button.click()
      await expect(button).toHaveAttribute('aria-expanded', 'true')
      await expect(menu.panel(page).getByRole('link', { name: menu.first })).toBeVisible()
      await button.click()
      await expect(button).toHaveAttribute('aria-expanded', 'false')
      await expect(menu.panel(page).getByRole('link', { name: menu.first })).toBeHidden()
      await button.click()
      await page.mouse.click(outsideTheMenus.x, outsideTheMenus.y)
      await expect(button).toHaveAttribute('aria-expanded', 'false')
    })

    test(`the ${menu.name} menu opens with the keyboard and Escape closes it`, async ({ page }) => {
      await page.goto('/legal/terms/')
      const button = trigger(page, menu.name)
      await button.focus()
      await page.keyboard.press('Enter')
      await expect(button).toHaveAttribute('aria-expanded', 'true')
      await page.keyboard.press('Tab')
      await expect(menu.panel(page).getByRole('link', { name: menu.first })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(button).toHaveAttribute('aria-expanded', 'false')
      await expect(button).toBeFocused()
      await page.keyboard.press('Space')
      await expect(button).toHaveAttribute('aria-expanded', 'true')
      await page.keyboard.press('Escape')
      await expect(menu.panel(page).getByRole('link', { name: menu.first })).toBeHidden()
    })

    test(`a link in the ${menu.name} menu opens its page and closes the menu`, async ({ page }) => {
      await page.goto('/legal/terms/')
      await trigger(page, menu.name).click()
      await menu.panel(page).getByRole('link', { name: menu.link }).click()
      await expect(page).toHaveURL(menu.path)
      await expect(trigger(page, menu.name)).toHaveAttribute('aria-expanded', 'false')
    })
  }

  test('every link in the header menus opens a page the site has, with no redirect', async ({
    page,
    request
  }) => {
    await page.goto('/')
    const hrefs = await page
      .getByRole('banner')
      .locator('a[href^="/"]')
      .evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute('href') ?? ''))
    expect(hrefs.length).toBeGreaterThan(10)
    for (const href of new Set(hrefs)) {
      expect((await request.get(href, { maxRedirects: 0 })).status(), href).toBe(200)
    }
  })

  test('the Dictionary menu leads to the search box', async ({ page }) => {
    await page.goto('/about/')
    await trigger(page, 'Dictionary').click()
    await page.getByRole('link', { name: /Open the dictionary$/ }).click()
    await expect(page).toHaveURL(/\/dictionary\/$/)
    await expect(
      page.getByRole('main').getByRole('textbox', { name: 'Search Japanese or English' })
    ).toBeVisible()
  })

  test('the header marks the section the page is in, and the page in its menu', async ({
    page
  }) => {
    await page.goto('/about/')
    await expect(trigger(page, 'Company')).toHaveAttribute('aria-current', 'true')
    await expect(trigger(page, 'Dictionary')).not.toHaveAttribute('aria-current')
    await trigger(page, 'Company').click()
    await expect(
      page.getByRole('list', { name: 'Company' }).getByRole('link', { name: 'About' })
    ).toHaveAttribute('aria-current', 'page')
    await page.goto(needed.path)
    await expect(trigger(page, 'Dictionary')).toHaveAttribute('aria-current', 'true')
    await expect(trigger(page, 'Company')).not.toHaveAttribute('aria-current')
  })
})

test.describe('site header below 1024 pixels', () => {
  test.beforeEach(phoneOnly)

  test('the header shows only the logo and the menu button, and fits a 320-pixel phone', async ({
    page
  }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(needed.path)
    const banner = page.getByRole('banner')
    await expect(banner.getByRole('link', { name: 'Zenbu Japanese' })).toBeInViewport({ ratio: 1 })
    await expect(banner.getByText('Zenbu Japanese')).toHaveCSS('position', 'absolute')
    await expect(mainNav(page)).toBeHidden()
    await expect(banner.getByRole('button', { name: 'Get the app' })).toBeHidden()
    await expect(menuButton(page)).toBeInViewport({ ratio: 1 })
    expect(await sidewaysOverflow(page), 'The page scrolls sideways').toBeLessThanOrEqual(0)
  })

  test('the drawer holds the menus as groups, then Get the app', async ({ page }) => {
    await page.goto('/legal/terms/')
    await menuButton(page).click()
    const menu = phoneMenu(page)
    await expect(menu).toBeVisible()
    const groups = menu.getByRole('navigation', { name: 'Sections' }).getByRole('button')
    await expect(groups).toHaveText(['Dictionary', 'Company'])
    await expect(groups.nth(1)).toHaveAttribute('aria-expanded', 'true')
    await expect(menu.getByRole('link', { name: 'Legal', exact: true })).toBeVisible()
    await expect(menu.getByRole('button', { name: 'Get the app' })).toBeVisible()
  })

  test('a drawer group opens and closes with a click, and its link opens the page', async ({
    page
  }) => {
    await page.goto('/about/')
    await menuButton(page).click()
    const menu = phoneMenu(page)
    const dictionary = menu.getByRole('button', { name: 'Dictionary' })
    await expect(dictionary).toHaveAttribute('aria-expanded', 'false')
    await dictionary.click()
    await expect(dictionary).toHaveAttribute('aria-expanded', 'true')
    await expect(menu.getByRole('link', { name: /^Search/ })).toBeVisible()
    await dictionary.click()
    await expect(menu.getByRole('link', { name: /^Search/ })).toBeHidden()
    await dictionary.click()
    await menu.getByRole('link', { name: /^Katakana/ }).click()
    await expect(page).toHaveURL(/\/dictionary\/browse\/katakana\/$/)
    await expect(menu).toBeHidden()
  })

  test('the drawer opens and its groups toggle with the keyboard, and Escape closes it', async ({
    page
  }) => {
    await page.goto('/about/')
    await menuButton(page).focus()
    await page.keyboard.press('Enter')
    const menu = phoneMenu(page)
    await expect(menu).toBeVisible()
    const dictionary = menu.getByRole('button', { name: 'Dictionary' })
    await dictionary.focus()
    await page.keyboard.press('Enter')
    await expect(dictionary).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Space')
    await expect(dictionary).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(menuButton(page)).toBeFocused()
  })

  test('the drawer marks the current page, and closes with its close button', async ({ page }) => {
    await page.goto('/support/')
    await menuButton(page).click()
    const menu = phoneMenu(page)
    await expect(menu.getByRole('link', { name: 'Support' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    await menu.getByRole('button', { name: 'Close' }).click()
    await expect(menu).toBeHidden()
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('the drawer closes when the browser goes back, and stays closed going forward', async ({
    page
  }) => {
    await page.goto('/')
    await menuButton(page).click()
    await phoneMenu(page).getByRole('button', { name: 'Company' }).click()
    await phoneMenu(page).getByRole('link', { name: 'About' }).click()
    await expect(page).toHaveURL(/\/about\/$/)
    await menuButton(page).click()
    await expect(phoneMenu(page)).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(phoneMenu(page)).toBeHidden()
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false')
    await page.goForward()
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible()
    await expect(phoneMenu(page)).toBeHidden()
  })

  test('the drawer closes when the window reaches 1024 pixels, and stays closed when it narrows', async ({
    page
  }) => {
    await page.goto('/')
    const phoneSize = page.viewportSize()
    await menuButton(page).click()
    await expect(phoneMenu(page)).toBeVisible()
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(phoneMenu(page)).toBeHidden()
    await expect(mainNav(page)).toBeVisible()
    if (phoneSize) await page.setViewportSize(phoneSize)
    await expect(mainNav(page)).toBeHidden()
    await expect(phoneMenu(page)).toBeHidden()
  })
})

const footerColumns = [
  ['Products', ['Dictionary']],
  ['Tools', ['Kana charts', 'Kanji lists', 'Frequency lists']],
  ['Company', ['About', 'Support', 'Contact', 'Sources']],
  ['Legal', ['Privacy Policy', 'Terms of Use', 'DMCA', 'Affiliate Disclosure']]
] as const

test.describe('site footer', () => {
  test('the footer groups its links under Products, Tools, Company, and Legal, then ends with the copyright and Sitemap', async ({
    page
  }) => {
    await page.goto('/')
    const footer = page.getByRole('contentinfo')
    for (const [group, links] of footerColumns) {
      await expect(footer.getByRole('navigation', { name: group }).getByRole('link')).toHaveText([
        ...links
      ])
    }
    await expect(footer.getByText(`© ${new Date().getFullYear()} Zenbu Japanese`)).toBeVisible()
    await footer.getByRole('link', { name: 'Sitemap' }).click()
    await expect(page).toHaveURL(/\/sitemap\/$/)
  })

  test('the footer lays its columns side by side from 768 pixels, and stacks them on phones', async ({
    page
  }) => {
    await page.goto('/')
    const footer = page.getByRole('contentinfo')
    const lefts = await Promise.all(
      footerColumns.map(async ([group]) => {
        const box = await footer.getByRole('navigation', { name: group }).boundingBox()
        return box?.x
      })
    )
    if (onPhone()) expect(new Set(lefts).size).toBe(1)
    else expect(new Set(lefts).size).toBe(footerColumns.length)
  })

  test('the footer shows plain social icons, five to a row on phones', async ({ page }) => {
    await page.goto('/')
    const icons = page.getByRole('contentinfo').getByRole('link', { name: /^Zenbu Japanese on / })
    await expect(icons).toHaveCount(10)
    const boxes = await icons.evaluateAll(links =>
      links.map(link => {
        const { x, y } = link.getBoundingClientRect()
        return { x: Math.round(x), y: Math.round(y) }
      })
    )
    const rows = new Set(boxes.map(box => box.y)).size
    expect(rows).toBe(onPhone() ? 2 : 1)
    if (onPhone()) expect(boxes[5].x).toBe(boxes[0].x)
  })
})
