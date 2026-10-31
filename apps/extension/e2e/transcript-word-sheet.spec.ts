import type { Page } from '@playwright/test'
import { playerCaptionLabels } from '../src/player-captions/labels.ts'
import { videoTabLabels } from '../src/video-tab/labels.ts'
import { savingLabels } from '../src/word-saving/labels.ts'
import { expect, test } from './fixtures.ts'
import {
  openStatus,
  panelBeside,
  sheetCard,
  sheetOf,
  transcriptWord,
  watchTab
} from './panel-beside.ts'
import { caption, openAt, overlay, videoState } from './watch-page.ts'
import { wordPopup } from './words-page.ts'

test.use({ youTubeStandIn: true })

const englishNotice = (panel: Page) => panel.locator('[data-translation-model]')

const paused = async (page: Page) => (await videoState(page)).paused

async function play(page: Page) {
  await overlay(page).getByRole('button', { name: playerCaptionLabels.play }).click()
  await expect.poll(() => paused(page)).toBe(false)
}

function countPlays(page: Page) {
  return page.evaluate(() => {
    const video = document.querySelector('video')
    if (!video) throw new Error('No video')
    document.body.dataset.plays = '0'
    video.addEventListener('play', () => {
      document.body.dataset.plays = String(Number(document.body.dataset.plays) + 1)
    })
  })
}

const plays = (page: Page) => page.evaluate(() => document.body.dataset.plays)

const stop = (page: Page) => page.evaluate(() => document.querySelector('video')?.pause())

function sheetLayout(panel: Page) {
  return panel.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('[data-word-sheet]')
    const holder = sheet?.offsetParent?.getBoundingClientRect()
    const box = sheet?.getBoundingClientRect()
    const word = [...document.querySelectorAll('[data-source] [data-word="要求"]')].at(-1)
    const line = word?.closest('[data-line]')?.getBoundingClientRect()
    const scroller = word?.closest('.overflow-y-auto')?.getBoundingClientRect()
    if (!holder || !box || !line || !scroller) return null
    return {
      share: Math.round((box.height / holder.height) * 100),
      toBottom: Math.round(holder.bottom - box.bottom),
      lineAbove: line.bottom <= box.top && line.top >= scroller.top
    }
  })
}

test('a word clicked in the transcript pauses the video and opens its card in a sheet over the lower half, with its line above it and no card on the page; the handle goes to full height and back, and X plays again', async ({
  extension,
  page
}) => {
  await openAt(page, 1)
  const { panel, transcript } = await panelBeside(extension, await watchTab(extension))
  await play(page)
  const controls = panel.getByRole('toolbar', { name: videoTabLabels.controls })
  await expect(controls.getByRole('button', { name: playerCaptionLabels.pause })).toBeVisible()
  await expect(englishNotice(panel)).toBeVisible()
  await transcriptWord(transcript).click()
  await expect(sheetCard(panel).locator('[data-meaning]').first()).toContainText('demand')
  await expect.poll(() => paused(page)).toBe(true)
  await expect(wordPopup(page)).toHaveCount(0)
  await expect(englishNotice(panel)).toBeHidden()
  await expect.poll(() => sheetLayout(panel)).toEqual({ share: 56, toBottom: 0, lineAbove: true })
  await panel.screenshot({ path: test.info().outputPath('sheet-half.png') })

  await panel.getByRole('button', { name: videoTabLabels.fullHeight }).click()
  await expect(sheetOf(panel)).toHaveAttribute('data-full', '')
  await expect.poll(async () => (await sheetLayout(panel))?.share).toBe(100)
  await panel.getByRole('button', { name: videoTabLabels.halfHeight }).click()
  await expect(sheetOf(panel)).not.toHaveAttribute('data-full')
  await expect.poll(async () => (await sheetLayout(panel))?.share).toBe(56)

  await countPlays(page)
  await sheetOf(panel).getByRole('button', { name: videoTabLabels.closeWord }).click()
  await expect(sheetOf(panel)).toHaveCount(0)
  await expect(englishNotice(panel)).toBeVisible()
  await expect.poll(() => plays(page)).toBe('1')
  expect(await paused(page)).toBe(false)
  await stop(page)
})

test('a transcript word opened with Enter shows its sheet with focus in the card, and Escape closes it, gives focus back to the word, and leaves a paused video paused', async ({
  extension,
  page
}) => {
  await openAt(page, 1)
  const { panel, transcript } = await panelBeside(extension, await watchTab(extension))
  const word = transcriptWord(transcript)
  await countPlays(page)
  for (const key of ['Enter', 'Space']) {
    await word.focus()
    await panel.keyboard.press(key)
    await expect(sheetCard(panel).locator('[data-meaning]').first()).toContainText('demand')
    await expect(sheetCard(panel)).toBeFocused()
    await expect(wordPopup(page)).toHaveCount(0)
    await panel.keyboard.press('Escape')
    await expect(sheetOf(panel)).toHaveCount(0)
    await expect(word).toBeFocused()
  }
  expect(await paused(page)).toBe(true)
  expect(await plays(page)).toBe('0')
})

test('a transcript word’s sheet offers the ••• menu’s Status, and signed out Known says to sign in in the sheet', async ({
  extension,
  page
}) => {
  await openAt(page, 1)
  const { panel, transcript } = await panelBeside(extension, await watchTab(extension))
  await expect(panel.locator('[data-known-share]')).toHaveCount(0)
  await expect(overlay(page).locator('[data-known-pill]')).toHaveCount(0)
  await openStatus(panel, transcript)
  await expect(panel.getByRole('menuitemradio', { name: 'Unknown' })).toBeChecked()
  await panel.getByRole('menuitemradio', { name: 'Known', exact: true }).click()
  await expect(sheetOf(panel).locator('[data-saving-toast="signed-out"]')).toContainText(
    savingLabels.signedOut.title
  )
  await expect(sheetOf(panel)).toBeVisible()
})

test('a card clicked while a word’s sheet is open closes the sheet and plays from its line', async ({
  extension,
  page
}) => {
  await openAt(page, 1)
  const { panel, transcript } = await panelBeside(extension, await watchTab(extension))
  await transcriptWord(transcript).click()
  await expect(sheetCard(panel)).toBeVisible()
  const card = transcript.locator('[data-line]').nth(1)
  await expect(card.getByRole('button', { name: videoTabLabels.playFrom(5) })).toBeAttached()
  await card.click({ position: { x: 12, y: 8 } })
  await expect(sheetOf(panel)).toHaveCount(0)
  await expect.poll(() => paused(page)).toBe(false)
  const { time = 0 } = await videoState(page)
  expect(time).toBeGreaterThanOrEqual(5)
  expect(time).toBeLessThan(7)
  await stop(page)
})

for (const everySite of [false, true])
  test(`a transcript word takes a caption word’s card off the page, a caption word clicked puts the sheet away, and the video plays once, when the last card closes${everySite ? ', with Every Site given' : ''}`, async ({
    extension,
    page
  }) => {
    await openAt(page, 1)
    const tabId = await watchTab(extension)
    if (everySite)
      await extension.serviceWorker.evaluate(
        id => chrome.scripting.executeScript({ target: { tabId: id }, files: ['page-lookup.js'] }),
        tabId
      )
    const { panel, transcript } = await panelBeside(extension, tabId)
    await play(page)
    await caption(page).locator('[data-word="要求"]').click()
    await expect(wordPopup(page)).toHaveCount(1)
    await expect.poll(() => paused(page)).toBe(true)

    await transcriptWord(transcript).click()
    await expect(sheetCard(panel)).toBeVisible()
    await expect(wordPopup(page)).toHaveCount(0)
    expect(await paused(page)).toBe(true)

    await countPlays(page)
    await caption(page).locator('[data-word="要求"]').click()
    await expect(wordPopup(page)).toHaveCount(1)
    await expect(sheetOf(panel)).toHaveCount(0)
    expect(await paused(page)).toBe(true)

    await page.keyboard.press('Escape')
    await expect(wordPopup(page)).toHaveCount(0)
    await expect.poll(() => plays(page)).toBe('1')
    await expect(sheetOf(panel)).toHaveCount(0)
    await stop(page)
  })
