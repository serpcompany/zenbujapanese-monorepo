import type { Locator, Page } from '@playwright/test'
import { playerCaptionLabels as labels } from '../src/player-captions/labels.ts'
import { expect, test } from './fixtures.ts'
import { caption, openAt, overlay, videoState } from './watch-page.ts'
import { changeSettings, wordPopup } from './words-page.ts'
import { standInWatchPage } from './youtube-stand-in.ts'

test.use({ youTubeStandIn: true })

test.afterEach(async ({ extension }) => {
  await changeSettings(extension, { 'videos.captionPlace': null })
})

type Point = { x: number; y: number }

const sideInset = 16

const player = (page: Page) => page.locator('#movie_player')

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Nothing drawn to measure.')
  return box
}

const background = (box: Point & { height: number }) => ({
  x: box.x + 4,
  y: box.y + box.height / 2
})

const cursorAt = (page: Page, point: Point) =>
  page.evaluate(({ x, y }) => {
    const root = document.querySelector('#movie_player > [data-zenbu-player-captions]')?.shadowRoot
    const element = root?.elementFromPoint(x, y)
    return element ? getComputedStyle(element).cursor : null
  }, point)

async function dragCaption(page: Page, to: (from: Point) => Point) {
  const from = background(await boxOf(caption(page)))
  const end = to(from)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 4 })
  const cursor = await cursorAt(page, end)
  await page.mouse.up()
  return cursor
}

async function edges(page: Page) {
  const box = await boxOf(caption(page))
  const outer = await boxOf(player(page))
  return {
    left: Math.round(box.x - outer.x),
    right: Math.round(outer.x + outer.width - box.x - box.width),
    top: Math.round(box.y - outer.y),
    bottom: Math.round(outer.y + outer.height - box.y - box.height)
  }
}

async function share(page: Page) {
  const { left, right, top, bottom } = await edges(page)
  return { x: (left - sideInset) / (left + right - 2 * sideInset), y: top / (top + bottom) }
}

const apart = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

const awayFrom = (page: Page, kept: Point) => share(page).then(now => apart(now, kept))

const heardFromVideo = (page: Page) =>
  page.evaluate(() => {
    const video = document.querySelector('video')
    if (!video) throw new Error('No video')
    video.dataset.heard = ''
    for (const type of ['pause', 'seeking'])
      video.addEventListener(type, () => {
        video.dataset.heard += `${type} `
      })
  })

const videoHeard = (page: Page) =>
  page.evaluate(() => document.querySelector('video')?.dataset.heard ?? null)

test('shows a grab hand over the caption’s background, and a drag moves it with the pointer, leaving the video playing and the words working', async ({
  page
}) => {
  await openAt(page, 10.2)
  await overlay(page).getByRole('button', { name: labels.play }).click()
  await expect.poll(async () => (await videoState(page)).paused).toBe(false)
  await heardFromVideo(page)
  const word = caption(page).locator('[data-word="要求"]')
  const start = await boxOf(caption(page))
  const wordBox = await boxOf(word)
  expect(await cursorAt(page, background(start))).toBe('grab')
  expect(
    await cursorAt(page, { x: wordBox.x + wordBox.width / 2, y: wordBox.y + wordBox.height / 2 })
  ).toBe('pointer')
  const cursor = await dragCaption(page, ({ x, y }) => ({ x: x - 60, y: y + 30 }))
  expect(cursor).toBe('grabbing')
  const moved = await boxOf(caption(page))
  expect(Math.abs(moved.x - start.x + 60)).toBeLessThan(1)
  expect(Math.abs(moved.y - start.y - 30)).toBeLessThan(1)
  expect(await cursorAt(page, background(moved))).toBe('grab')
  expect(await videoHeard(page)).toBe('')
  expect((await videoState(page)).paused).toBe(false)
  await word.click()
  await expect(wordPopup(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(wordPopup(page)).toBeHidden()
  await page.evaluate(() => document.querySelector('video')?.pause())
})

test('keeps the caption wholly inside the player at every edge', async ({ page }) => {
  await openAt(page, 1)
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('No viewport')
  const far = { left: 0, top: 0, right: viewport.width - 1, bottom: viewport.height - 1 }
  for (const [across, down] of [
    ['left', 'top'],
    ['right', 'top'],
    ['left', 'bottom'],
    ['right', 'bottom']
  ] as const) {
    await dragCaption(page, () => ({ x: far[across], y: far[down] }))
    const at = await edges(page)
    expect([at[across], at[down]]).toEqual([sideInset, 0])
    expect(Math.min(at.left, at.right, at.top, at.bottom)).toBeGreaterThanOrEqual(0)
  }
})

test('keeps the caption under the pointer when the line changes mid-drag', async ({ page }) => {
  await openAt(page, 1)
  const start = await boxOf(caption(page))
  const from = background(start)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 40, from.y - 20, { steps: 4 })
  await page.evaluate(() => {
    const video = document.querySelector('video')
    if (video) video.currentTime = 6
  })
  await expect(caption(page).locator('[data-word="要領"]')).toBeVisible()
  const next = await boxOf(caption(page))
  expect(Math.abs(next.width - start.width)).toBeGreaterThan(10)
  await page.mouse.move(from.x + 80, from.y - 30, { steps: 4 })
  const moved = await boxOf(caption(page))
  await page.mouse.up()
  expect(Math.abs(moved.x - (start.x + 80))).toBeLessThan(1)
  expect(Math.abs(moved.y - (start.y - 30))).toBeLessThan(1)
  const dropped = await boxOf(caption(page))
  expect(Math.abs(dropped.x - moved.x)).toBeLessThan(1)
})

test('keeps the caption’s place when the player resizes, in fullscreen, and for the next video, and a double-click puts it back', async ({
  page
}) => {
  await openAt(page, 1)
  await dragCaption(page, ({ x, y }) => ({ x: x - 70, y: y - 20 }))
  const kept = await share(page)
  expect([kept.x, kept.y].every(at => at > 0.05 && at < 0.45)).toBe(true)
  await page.evaluate(() => {
    const video = document.querySelector('video')
    if (video) video.width = 720
  })
  await expect.poll(() => boxOf(player(page)).then(box => box.width)).toBe(720)
  await expect.poll(() => awayFrom(page, kept)).toBeLessThan(0.01)
  await page.evaluate(() => document.querySelector('#movie_player')?.requestFullscreen())
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('movie_player')
  await expect.poll(() => awayFrom(page, kept)).toBeLessThan(0.01)
  await page.evaluate(() => document.exitFullscreen())
  await openAt(page, 1, standInWatchPage.replace('zenbuJa0001', 'zenbuJa0002'))
  await expect.poll(() => awayFrom(page, kept)).toBeLessThan(0.01)
  const { x, y } = background(await boxOf(caption(page)))
  await page.mouse.dblclick(x, y)
  await expect.poll(() => edges(page).then(at => at.bottom)).toBe(64)
  expect(Math.abs((await share(page)).x - 0.5)).toBeLessThan(0.01)
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  await openAt(page, 1)
  await expect.poll(() => edges(page).then(at => at.bottom)).toBe(64)
  expect(Math.abs((await share(page)).x - 0.5)).toBeLessThan(0.01)
})
