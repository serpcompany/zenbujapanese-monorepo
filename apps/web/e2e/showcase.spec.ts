import type { Locator, Page } from '@playwright/test'
import { appAreas } from '../src/lib/app-areas'
import { expect, sidewaysOverflow, test } from './test'

const showcase = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('region', { name: 'One app for reading, watching, and talking', exact: true })

const areaTab = (page: Page, name: string) => showcase(page).getByRole('tab', { name, exact: true })

const dictionary = appAreas[0]

const screensThatFit = (page: Page) => ((page.viewportSize()?.width ?? 0) >= 768 ? 3 : 2)

async function expectPeeking(stage: Locator, slide: Locator) {
  const stageBox = await stage.boundingBox()
  const slideBox = await slide.boundingBox()
  if (!stageBox || !slideBox) throw new Error('The stage or the slide is not on the page')
  const stageRight = stageBox.x + stageBox.width
  expect(slideBox.x).toBeLessThan(stageRight)
  expect(slideBox.x + slideBox.width).toBeGreaterThan(stageRight)
}

async function expectCurrentDots(stage: Locator, current: number[]) {
  for (const [index, item] of dictionary.media.entries()) {
    const dot = stage.getByRole('button', { name: item.label, exact: true })
    if (current.includes(index)) await expect(dot).toHaveAttribute('aria-current', 'true')
    else await expect(dot).not.toHaveAttribute('aria-current')
  }
}

const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i)

test.describe('area showcase', () => {
  test('each tab shows its own area', async ({ page }) => {
    await page.goto('/')
    for (const area of appAreas) {
      await areaTab(page, area.name).click()
      await expect(areaTab(page, area.name)).toHaveAttribute('aria-selected', 'true')
      const panel = showcase(page).getByRole('tabpanel')
      await expect(panel).toHaveCount(1)
      await expect(panel).toHaveAccessibleName(area.name)
      await expect(panel.getByRole('heading', { level: 3 })).toHaveText(area.pitch)
      await expect(panel.getByRole('listitem')).toHaveText([...area.features])
      const stage = showcase(page).getByRole('region')
      await expect(stage).toHaveCount(1)
      await expect(stage).toHaveAccessibleName(area.name)
      await expect(stage.getByRole('group')).toHaveCount(area.media.length)
      await expect(stage.getByRole('group').first()).toHaveAccessibleName(
        `${area.media[0]?.label}, 1 of ${area.media.length}`
      )
    }
  })

  test('the tabs work by keyboard', async ({ page }) => {
    await page.goto('/')
    const panelHeading = showcase(page).getByRole('tabpanel').getByRole('heading', { level: 3 })
    await areaTab(page, 'Dictionary').focus()
    for (const [key, area] of [
      ['ArrowRight', appAreas[1]],
      ['End', appAreas.at(-1)],
      ['Home', appAreas[0]],
      ['ArrowLeft', appAreas.at(-1)]
    ] as const) {
      await page.keyboard.press(key)
      const tab = areaTab(page, area?.name ?? '')
      await expect(tab).toBeFocused()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(panelHeading).toHaveText(area?.pitch ?? '')
    }
  })

  test('the arrows and dots page through the Dictionary screens, and the next one peeks in', async ({
    page
  }) => {
    await page.goto('/')
    const stage = showcase(page).getByRole('region', { name: dictionary.name })
    const slides = stage.getByRole('group')
    const previous = stage.getByRole('button', { name: 'Previous screens' })
    const next = stage.getByRole('button', { name: 'Next screens' })
    const shown = screensThatFit(page)
    const last = dictionary.media.length - shown
    await expect(next).toBeEnabled()
    await expect(previous).toBeDisabled()
    await expectCurrentDots(stage, range(0, shown))
    await expectPeeking(stage, slides.nth(shown))
    await next.click()
    await expectCurrentDots(stage, range(1, shown))
    await expect(previous).toBeEnabled()
    for (let step = 1; step < last; step++) await next.click()
    await expect(next).toBeDisabled()
    await expectCurrentDots(stage, range(last, shown))
    await stage.getByRole('button', { name: dictionary.media[0]?.label, exact: true }).click()
    await expectCurrentDots(stage, range(0, shown))
    await expect(previous).toBeDisabled()
  })

  test('nothing advances on its own', async ({ page }) => {
    await page.clock.install()
    await page.goto('/')
    const stage = showcase(page).getByRole('region', { name: dictionary.name })
    await expect(stage.getByRole('button', { name: 'Next screens' })).toBeEnabled()
    const first = await stage.getByRole('group').first().boundingBox()
    await page.clock.runFor('02:00')
    await expect(areaTab(page, dictionary.name)).toHaveAttribute('aria-selected', 'true')
    await expectCurrentDots(stage, range(0, screensThatFit(page)))
    expect(await stage.getByRole('group').first().boundingBox()).toEqual(first)
  })

  test('every area fits the window, with all five tabs in view', async ({ page }) => {
    await page.goto('/')
    const width = page.viewportSize()?.width ?? 0
    for (const area of appAreas) {
      const tab = areaTab(page, area.name)
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      for (const each of appAreas) {
        const box = await areaTab(page, each.name).boundingBox()
        expect(box && box.x + box.width, each.name).toBeLessThanOrEqual(width)
      }
      expect(await sidewaysOverflow(page), 'The page scrolls sideways').toBeLessThanOrEqual(0)
    }
  })

  test('choosing an area doesn’t move the page below the showcase', async ({ page }) => {
    await page.goto('/')
    const next = page.getByRole('main').getByRole('region', { name: /^Free on the web\./ })
    const nextTop = () =>
      next.evaluate(element => element.getBoundingClientRect().top + window.scrollY)
    const tops = []
    for (const area of appAreas) {
      await areaTab(page, area.name).click()
      await expect(areaTab(page, area.name)).toHaveAttribute('aria-selected', 'true')
      tops.push(await nextTop())
    }
    expect(new Set(tops).size, `The next section's top on each tab: ${tops.join(', ')}`).toBe(1)
  })

  for (const width of [412, 700, 900]) {
    test(`at ${width} pixels each Dictionary screen in view shows whole`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('/')
      const stage = showcase(page).getByRole('region', { name: dictionary.name })
      await expect(stage.getByRole('button', { name: 'Next screens' })).toBeEnabled()
      const cropped = await stage.evaluate(element => {
        const edge = element.getBoundingClientRect()
        return [...element.querySelectorAll('img')]
          .map(image => ({ alt: image.alt, box: image.getBoundingClientRect() }))
          .filter(({ box }) => box.left >= edge.left && box.right <= edge.right)
          .filter(({ box }) => box.bottom > edge.bottom)
          .map(({ alt }) => alt)
      })
      expect(cropped).toEqual([])
    })
  }

  test('tapping a kanji in 弱肉強食 moves the highlight to its part of the reading', async ({
    page
  }) => {
    await page.goto('/')
    await areaTab(page, 'Lists').click()
    const lists = showcase(page).getByRole('region', { name: 'Lists' })
    if (test.info().project.name === 'phone')
      await lists.getByRole('button', { name: 'Tap a kanji', exact: true }).click()
    const niku = lists.getByRole('button', { name: '肉, にく' })
    const kyou = lists.getByRole('button', { name: '強, きょう' })
    await expect(niku).toHaveAttribute('aria-pressed', 'true')
    await kyou.click()
    await expect(kyou).toHaveAttribute('aria-pressed', 'true')
    await expect(niku).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('area showcase without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('every area’s text and screens are in the server HTML', async ({ page }) => {
    await page.goto('/')
    const all = { includeHidden: true }
    await expect(showcase(page).getByRole('tab', all)).toHaveText(appAreas.map(area => area.name))
    await expect(showcase(page).getByRole('heading', { level: 3, ...all })).toHaveText(
      appAreas.map(area => area.pitch)
    )
    await expect(showcase(page).getByRole('tabpanel', all).getByRole('listitem', all)).toHaveText(
      appAreas.flatMap(area => area.features)
    )
    await expect(showcase(page).getByRole('group', all)).toHaveCount(
      appAreas.reduce((count, area) => count + area.media.length, 0)
    )
  })
})
