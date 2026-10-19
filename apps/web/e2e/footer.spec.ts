import type { Locator, Page } from '@playwright/test'
import { socialLinks } from '../src/lib/site'
import { expect, onPhone, sidewaysOverflow, test } from './test'

const footerColumns = [
  ['Products', ['Zenbu Japanese for iPhone', 'Dictionary', 'Sign in']],
  ['Tools', ['Kana charts', 'Kanji lists', 'Frequency lists', 'All tools']],
  ['Company', ['About', 'Support', 'Contact', 'Sources']],
  ['Legal', ['Privacy Policy', 'Terms of Use', 'DMCA', 'Affiliate Disclosure']]
] as const

const footerIcons = (page: Page) =>
  page.getByRole('contentinfo').getByRole('link', { name: /^Zenbu Japanese on / })
const socialsTrigger = (page: Page) =>
  page.getByRole('contentinfo').getByRole('button', { name: 'Socials, Zenbu Japanese elsewhere' })
const footerLanguageTrigger = (page: Page) =>
  page.getByRole('contentinfo').getByRole('button', { name: 'EN, English, change language' })

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${locator} has no box`)
  return box
}

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

  test('from 768 pixels the nine social icons sit before the language menu, as 16-pixel marks in 28-pixel targets 4 pixels apart', async ({
    page
  }) => {
    test.skip(onPhone(), 'The phone project is narrower than 768 pixels')
    for (const width of [768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(footerIcons(page)).toHaveCount(9)
      await expect(socialsTrigger(page)).toBeHidden()
      const boxes = await footerIcons(page).evaluateAll(links =>
        links.map(link => {
          const target = link.getBoundingClientRect()
          const mark = link.querySelector('svg')?.getBoundingClientRect()
          return {
            left: Math.round(target.left),
            right: Math.round(target.right),
            middle: Math.round(target.top + target.height / 2),
            size: [target.width, target.height, mark?.width ?? 0]
          }
        })
      )
      expect(new Set(boxes.map(box => box.middle)).size).toBe(1)
      for (const box of boxes) expect(box.size).toEqual([28, 28, 16])
      expect(boxes.slice(1).map((box, index) => box.left - boxes[index].right)).toEqual(
        Array(8).fill(4)
      )
      const language = await boxOf(footerLanguageTrigger(page))
      expect(boxes[8].right).toBeLessThan(language.x)
      expect(Math.abs(boxes[8].middle - (language.y + language.height / 2))).toBeLessThanOrEqual(1)
      expect(
        await sidewaysOverflow(page),
        `The page scrolls sideways at ${width}`
      ).toBeLessThanOrEqual(0)
    }
  })

  test('below 768 pixels the icons fold into a Socials menu before the language menu, which opens upward with the nine networks', async ({
    page
  }) => {
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 740 })
      await page.goto('/')
      await expect(footerIcons(page)).toHaveCount(0)
      const trigger = await boxOf(socialsTrigger(page))
      const language = await boxOf(footerLanguageTrigger(page))
      expect(Math.min(trigger.width, trigger.height)).toBeGreaterThanOrEqual(24)
      expect(trigger.x + trigger.width).toBeLessThanOrEqual(language.x)
      expect(trigger.y).toBe(language.y)
      expect(
        await sidewaysOverflow(page),
        `The page scrolls sideways at ${width}`
      ).toBeLessThanOrEqual(0)
    }
    const menu = page.getByRole('menu', { name: 'Socials, Zenbu Japanese elsewhere' })
    await expect(async () => {
      if (!(await menu.isVisible())) await socialsTrigger(page).click()
      await expect(menu).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    const items = menu.getByRole('menuitem')
    await expect(items).toHaveText(socialLinks.map(link => link.name))
    expect(await items.evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(
      socialLinks.map(link => link.href)
    )
    await expect(items.locator('svg')).toHaveCount(9)
    const opened = await boxOf(menu)
    expect(opened.y + opened.height).toBeLessThanOrEqual((await boxOf(socialsTrigger(page))).y)
    expect(
      await sidewaysOverflow(page),
      'The open menu scrolls the page sideways'
    ).toBeLessThanOrEqual(0)
  })

  test('Tab reaches the Socials menu after the footer links, Enter or Down Arrow opens it, and Escape closes it', async ({
    page
  }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    await page.goto('/')
    const menu = page.getByRole('menu', { name: 'Socials, Zenbu Japanese elsewhere' })
    const lastLink = page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'Affiliate Disclosure' })
    await expect(async () => {
      await lastLink.focus()
      await page.keyboard.press('Tab')
      await expect(socialsTrigger(page)).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(menu).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(socialsTrigger(page)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: 'YouTube' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(socialsTrigger(page)).toBeFocused()
  })
})
