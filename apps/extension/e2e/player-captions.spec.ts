import { writeFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { playerCaptionLabels as labels } from '../src/player-captions/labels.ts'
import { textContrast } from './contrast.ts'
import { expect, test } from './fixtures.ts'
import { changeSettings, tones, wordPopup } from './words-page.ts'
import { standInWatchPage } from './youtube-stand-in.ts'

test.use({ youTubeStandIn: true })

const overlay = (page: Page) => page.locator('#movie_player > [data-zenbu-player-captions]')

const caption = (page: Page) => overlay(page).locator('[data-player-caption]')

const videoState = (page: Page) =>
  page.evaluate(() => {
    const element = document.querySelector('video')
    return { paused: element?.paused, rate: element?.playbackRate, time: element?.currentTime }
  })

async function openAt(page: Page, time: number) {
  await page.goto(standInWatchPage)
  await expect(overlay(page)).toBeAttached()
  await page.evaluate(at => {
    const element = document.querySelector('video')
    if (!element) throw new Error('No video')
    element.muted = true
    element.currentTime = at
  }, time)
  await expect(caption(page).locator('[data-word="要求"]')).toBeVisible()
}

async function chooseSpeed(page: Page, from: number, to: number) {
  await overlay(page)
    .getByRole('button', { name: labels.speedMenu(from) })
    .click()
  const menu = overlay(page).getByRole('menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitemradio', { name: labels.speed(to) }).click()
  await expect.poll(async () => (await videoState(page)).rate).toBe(to)
}

test('draws the line being heard inside the player, in place of the site’s captions, with nothing added to the page’s styles', async ({
  extension,
  page
}) => {
  await openAt(page, 1)
  await expect(page.locator('.ytp-caption-window-container')).toBeHidden()
  await expect(caption(page).locator('[data-word="要る"]')).toBeVisible()
  await expect(caption(page).locator('[data-aid="romaji"]')).toHaveCount(1)
  await expect(caption(page).locator('[data-aid="romaji"]')).toBeHidden()
  const pageStyles = await page.evaluate(() => ({
    styles: [...document.head.querySelectorAll('style')].map(style => style.textContent),
    links: document.querySelectorAll('link[rel="stylesheet"]').length
  }))
  expect(pageStyles).toEqual({
    styles: [expect.stringContaining('.ytp-caption-window-container')],
    links: 0
  })
  const timedText = () => extension.youTube?.asked.filter(line => line.includes('/api/timedtext'))
  expect(timedText()).toHaveLength(1)
  await page.evaluate(() => {
    const element = document.querySelector('video')
    element?.addEventListener(
      'seeked',
      () => {
        element.dataset.landedAt = String(element.currentTime)
      },
      { once: true }
    )
  })
  await overlay(page).getByRole('button', { name: labels.nextLine }).click()
  const landedAt = () =>
    page.evaluate(() => Number(document.querySelector('video')?.dataset.landedAt ?? Number.NaN))
  await expect.poll(async () => Math.abs((await landedAt()) - 5)).toBeLessThan(0.05)
  await expect
    .poll(async () => {
      const { paused, time = 0 } = await videoState(page)
      return paused && time >= 9 - 0.05 && time < 10
    })
    .toBe(true)
  await overlay(page).getByRole('button', { name: labels.repeatLine }).click()
  await chooseSpeed(page, 1, 0.75)
  expect(timedText()).toHaveLength(1)
})

test('draws word meanings on the caption at least 4.5:1 against its band over the brightest frame, in either page theme', async ({
  extension,
  page
}) => {
  await changeSettings(extension, { 'readingAids.wordMeanings': true })
  await openAt(page, 1)
  const meaning = caption(page).locator('[data-aid="meaning"]').first()
  await expect(meaning).toBeVisible()
  const measured: Record<string, number> = {}
  for (const tone of tones) {
    await page.emulateMedia({ colorScheme: tone })
    measured[tone] = await textContrast(meaning, '[data-player-caption]')
    expect(measured[tone]).toBeGreaterThanOrEqual(4.5)
  }
  writeFileSync(test.info().outputPath('contrast.json'), JSON.stringify(measured))
  await changeSettings(extension, { 'readingAids.wordMeanings': false })
})

test('draws the caption in Geist with no request from the page for the extension’s files', async ({
  page
}) => {
  const extensionFiles: string[] = []
  page.on('request', request => {
    if (request.url().startsWith('chrome-extension:')) extensionFiles.push(request.url())
  })
  await openAt(page, 1)
  const geist = await page.evaluate(() =>
    [...document.fonts].filter(font => font.family.includes('Zenbu Geist')).map(font => font.status)
  )
  expect(geist).toEqual(['loaded', 'loaded'])
  expect(extensionFiles).toEqual([])
})

test('opens the speed menu inside the player, in and out of fullscreen', async ({ page }) => {
  await openAt(page, 1)
  await chooseSpeed(page, 1, 0.75)
  await page.evaluate(() => document.querySelector('#movie_player')?.requestFullscreen())
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('movie_player')
  await chooseSpeed(page, 0.75, 1.25)
  await overlay(page)
    .getByRole('button', { name: labels.speedMenu(1.25) })
    .click()
  const item = overlay(page).getByRole('menuitemradio', { name: labels.speed(1.5) })
  await expect(item).toBeVisible()
  const onTop = await item.evaluate(element => {
    const box = element.getBoundingClientRect()
    const atPoint = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    const host = (element.getRootNode() as ShadowRoot).host
    return atPoint === host && document.fullscreenElement?.contains(host)
  })
  expect(onTop).toBe(true)
  await page.keyboard.press('Escape')
  await page.evaluate(() => document.exitFullscreen())
})

test('pauses the video while a word’s popup is open, and plays it again when the popup closes', async ({
  page
}) => {
  await openAt(page, 1)
  await overlay(page).getByRole('button', { name: labels.play }).click()
  await expect.poll(async () => (await videoState(page)).paused).toBe(false)
  await caption(page).locator('[data-word="要求"]').click()
  await expect(wordPopup(page)).toBeVisible()
  await expect.poll(async () => (await videoState(page)).paused).toBe(true)
  await expect(overlay(page).getByText(labels.pausedForPopup)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(wordPopup(page)).toBeHidden()
  await expect.poll(async () => (await videoState(page)).paused).toBe(false)
  await expect(overlay(page).getByText(labels.pausedForPopup)).toBeHidden()
  await page.evaluate(() => document.querySelector('video')?.pause())
})
