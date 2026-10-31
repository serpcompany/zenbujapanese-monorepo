import type { Locator, Page } from '@playwright/test'
import { playerCaptionLabels as labels } from '../src/player-captions/labels.ts'
import { settingsLabels } from '../src/settings/labels.ts'
import { captionPlacesReset } from '../src/shared/settings.ts'
import { type Extension, expect, extensionUrl, test } from './fixtures.ts'
import { caption, english, enterFullscreen, openAt, overlay, videoState } from './watch-page.ts'
import { changeSettings, wordPopup } from './words-page.ts'
import { standInWatchPage } from './youtube-stand-in.ts'

test.use({ youTubeStandIn: true })

test.afterEach(async ({ extension }) => {
  await changeSettings(extension, captionPlacesReset)
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

async function lift(page: Page, box: Locator, from: Point) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await expect(box).toHaveAttribute('data-dragging', '')
}

async function dragBox(page: Page, box: Locator, to: (from: Point) => Point) {
  const from = background(await boxOf(box))
  const end = to(from)
  await lift(page, box, from)
  await page.mouse.move(end.x, end.y, { steps: 4 })
  const cursor = await cursorAt(page, end)
  await page.mouse.up()
  await expect(box).not.toHaveAttribute('data-dragging')
  return cursor
}

async function edges(page: Page, box = caption(page)) {
  const drawn = await boxOf(box)
  const outer = await boxOf(player(page))
  return {
    left: Math.round(drawn.x - outer.x),
    right: Math.round(outer.x + outer.width - drawn.x - drawn.width),
    top: Math.round(drawn.y - outer.y),
    bottom: Math.round(outer.y + outer.height - drawn.y - drawn.height)
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

const standInEnglish: Record<string, string> = {
  '要求が要る。': 'It needs a demand.',
  '要領と要項。': 'The knack and the main points.',
  '要所要所に要求。': 'A demand at every key point.',
  '要求。': 'A demand.'
}

async function translatedByServiceWorker(extension: Extension) {
  await extension.serviceWorker.evaluate(english => {
    type Sent = { target?: string; translation?: { type?: string; texts?: string[] } }
    const runtime = chrome.runtime as typeof chrome.runtime & { keptSend?: unknown }
    const send = chrome.runtime.sendMessage.bind(chrome.runtime)
    runtime.keptSend = chrome.runtime.sendMessage
    const answer = (sent: Sent, ...rest: unknown[]) =>
      sent?.target === 'offscreen' && sent.translation?.type === 'translate'
        ? Promise.resolve({
            type: 'translated',
            texts: (sent.translation.texts ?? []).map(text => english[text] ?? '')
          })
        : (send as (...args: unknown[]) => Promise<unknown>)(sent, ...rest)
    Object.assign(chrome.runtime, { sendMessage: answer })
  }, standInEnglish)
  return () =>
    extension.serviceWorker.evaluate(() => {
      const runtime = chrome.runtime as typeof chrome.runtime & { keptSend?: unknown }
      Object.assign(chrome.runtime, { sendMessage: runtime.keptSend })
      delete runtime.keptSend
    })
}

async function resetFromSidePanel(page: Page, extension: Extension) {
  const panel = await page.context().newPage()
  await panel.setViewportSize({ width: 380, height: 720 })
  await panel.goto(extensionUrl(extension, 'pages/side-panel.html'))
  await panel.getByRole('button', { name: settingsLabels.menu.open }).click()
  await panel.getByRole('menuitem', { name: settingsLabels.menu.resetCaptionPosition }).click()
  await panel.close()
}

test('shows a grab hand over the caption, lifts it after a hold, and a drag then moves it with the pointer, leaving the video playing and the words working', async ({
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
  const { x, y } = background(start)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 60, y + 30, { steps: 4 })
  await page.mouse.up()
  expect(await boxOf(caption(page))).toEqual(start)
  const cursor = await dragBox(page, caption(page), from => ({ x: from.x - 60, y: from.y + 30 }))
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
  const held = await boxOf(word)
  await lift(page, caption(page), { x: held.x + held.width / 2, y: held.y + held.height / 2 })
  await page.mouse.up()
  await expect(wordPopup(page)).toBeVisible()
  expect(await boxOf(caption(page))).toEqual(moved)
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
    await dragBox(page, caption(page), () => ({ x: far[across], y: far[down] }))
    const at = await edges(page)
    expect([at[across], at[down]]).toEqual([sideInset, 0])
    expect(Math.min(at.left, at.right, at.top, at.bottom)).toBeGreaterThanOrEqual(0)
  }
})

test('keeps the caption under the pointer when the line changes mid-drag', async ({ page }) => {
  await openAt(page, 1)
  const start = await boxOf(caption(page))
  const from = background(start)
  await lift(page, caption(page), from)
  await page.mouse.move(from.x + 40, from.y - 20, { steps: 4 })
  await page.evaluate(() => {
    const video = document.querySelector('video')
    if (video) video.currentTime = 16
  })
  await expect(caption(page).locator('[data-word="要る"]')).toHaveCount(0)
  await expect(caption(page).locator('[data-word="要求"]')).toBeVisible()
  const next = await boxOf(caption(page))
  expect(start.width - next.width).toBeGreaterThan(start.width / 4)
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
  await dragBox(page, caption(page), ({ x, y }) => ({ x: x - 70, y: y - 20 }))
  const kept = await share(page)
  expect([kept.x, kept.y].every(at => at > 0.05 && at < 0.45)).toBe(true)
  await page.evaluate(() => {
    const video = document.querySelector('video')
    if (video) video.width = 720
  })
  await expect.poll(() => boxOf(player(page)).then(box => box.width)).toBe(720)
  await expect.poll(() => awayFrom(page, kept)).toBeLessThan(0.01)
  await enterFullscreen(page)
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

test('shows the English in its own box under the caption, drags each box on its own, and Reset Caption Position in the side panel puts both back', async ({
  page,
  extension
}) => {
  const restore = await translatedByServiceWorker(extension)
  try {
    await openAt(page, 1)
    await expect(english(page)).toHaveText('It needs a demand.')
    await expect(caption(page)).not.toContainText('It needs a demand.')
    const startCaption = await boxOf(caption(page))
    const startEnglish = await boxOf(english(page))
    expect(startEnglish.y).toBeGreaterThan(startCaption.y + startCaption.height)
    const centre = (box: { x: number; width: number }) => box.x + box.width / 2
    expect(Math.abs(centre(startEnglish) - centre(startCaption))).toBeLessThan(1)
    expect((await edges(page, english(page))).bottom).toBe(64)

    await dragBox(page, english(page), ({ x, y }) => ({ x: x - 140, y: y - 40 }))
    const movedEnglish = await boxOf(english(page))
    expect(Math.abs(movedEnglish.x - (startEnglish.x - 140))).toBeLessThan(1)
    expect(Math.abs(movedEnglish.y - (startEnglish.y - 40))).toBeLessThan(1)
    await expect.poll(() => edges(page).then(at => at.bottom)).toBe(64)

    await dragBox(page, caption(page), ({ x, y }) => ({ x: x + 60, y: y - 30 }))
    await expect.poll(() => edges(page).then(at => at.bottom)).toBe(94)
    expect(await boxOf(english(page))).toEqual(movedEnglish)

    await resetFromSidePanel(page, extension)
    await expect.poll(() => edges(page, english(page)).then(at => at.bottom)).toBe(64)
    const reset = await boxOf(caption(page))
    expect(Math.abs(reset.y - startCaption.y)).toBeLessThan(1)
    expect(Math.abs(centre(reset) - centre(startCaption))).toBeLessThan(1)
  } finally {
    await restore()
  }
})
