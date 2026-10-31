import { expect, type Page } from '@playwright/test'
import { standInWatchPage } from './youtube-stand-in.ts'

export const overlay = (page: Page) => page.locator('#movie_player > [data-zenbu-player-captions]')

export const caption = (page: Page) => overlay(page).locator('[data-player-caption]')

export const english = (page: Page) => overlay(page).locator('[data-player-translation]')

export const videoState = (page: Page) =>
  page.evaluate(() => {
    const element = document.querySelector('video')
    return { paused: element?.paused, rate: element?.playbackRate, time: element?.currentTime }
  })

export async function openAt(page: Page, time: number, url = standInWatchPage) {
  await page.goto(url)
  await expect(overlay(page)).toBeAttached()
  await page.evaluate(at => {
    const element = document.querySelector('video')
    if (!element) throw new Error('No video')
    element.muted = true
    element.currentTime = at
  }, time)
  await expect(caption(page).locator('[data-word="要求"]')).toBeVisible()
}

export async function enterFullscreen(page: Page) {
  const heading = page.locator('h1')
  await heading.evaluate(element =>
    element.addEventListener(
      'click',
      () => void document.querySelector('#movie_player')?.requestFullscreen(),
      { once: true }
    )
  )
  await heading.click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('movie_player')
}
