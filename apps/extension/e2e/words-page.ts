import type { Page } from '@playwright/test'
import { wordPath } from '@zenbu/dictionary-core/detail/word-path'
import type { Settings } from '../src/shared/settings.ts'
import type { Extension } from './fixtures.ts'

export type Tone = 'light' | 'dark'

export const tones: Tone[] = ['light', 'dark']

export const highlightNames: Record<Tone, string> = {
  light: 'zenbu-japanese-word',
  dark: 'zenbu-japanese-word-on-dark'
}

export const underlineColors: Record<Tone, string> = {
  light: 'rgb(37, 99, 235)',
  dark: 'rgb(96, 165, 250)'
}

export const allowedHost = 'allowed.localhost'

export const wordsPageUrl = (extension: Extension, tone: Tone) =>
  `${extension.server.allowedSiteUrl}/test-pages/words.html${tone === 'dark' ? '?dark' : ''}`

export const noReadingAids: Partial<Settings> = {
  'readingAids.furigana': false,
  'readingAids.romaji': false,
  'readingAids.wordMeanings': false,
  'sites.off': []
}

export const pageWords = {
  sentence: ['要求', '要る'],
  choice: ['要', '要所', '要領', '要項'],
  'word-link': ['要領'],
  'top-left': ['要求'],
  'top-right': ['要求'],
  'bottom-left': ['要求'],
  'bottom-right': ['要求']
}

export const wordUrl = (headword: string, reading: string, entSeq: number) =>
  new URL(wordPath({ headword, reading, entSeq }), 'https://zenbujapanese.com').href

export async function changeSettings(extension: Extension, changes: Partial<Settings>) {
  await extension.serviceWorker.evaluate(items => chrome.storage.local.set(items), changes)
}

export function underlinedWords(page: Page) {
  return page.evaluate(names => {
    const words: Record<string, Record<string, string[]>> = {}
    for (const [tone, name] of Object.entries(names)) {
      const byElement: Record<string, string[]> = {}
      for (const range of CSS.highlights.get(name) ?? []) {
        const id = range.startContainer.parentElement?.closest('[id]')?.id ?? ''
        byElement[id] = [...(byElement[id] ?? []), range.toString()]
      }
      words[tone] = byElement
    }
    return words
  }, highlightNames)
}

export function underlineRules(page: Page) {
  return page.evaluate(() =>
    document.adoptedStyleSheets
      .flatMap(sheet => [...sheet.cssRules])
      .map(rule => rule.cssText)
      .filter(text => text.includes('::highlight'))
  )
}

export function pageLayout(page: Page) {
  return page.evaluate(() =>
    [document.documentElement, ...document.body.querySelectorAll('*')]
      .filter(element => !element.closest('zenbu-japanese'))
      .map(element => {
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          element: `${element.tagName}#${element.id}`,
          box: [box.x, box.y, box.width, box.height],
          color: style.color,
          background: style.backgroundColor,
          decoration: style.textDecorationLine,
          href: element.getAttribute('href')
        }
      })
  )
}

export function wordPoint(page: Page, selector: string, word: string) {
  return page.evaluate(
    ([within, wanted]) => {
      const element = document.querySelector(within)
      if (!element) throw new Error('No element')
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node as Text
        const start = text.data.indexOf(wanted)
        if (start < 0) continue
        const range = document.createRange()
        range.setStart(text, start)
        range.setEnd(text, start + wanted.length)
        const box = range.getBoundingClientRect()
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      }
      throw new Error('No such word')
    },
    [selector, word]
  )
}

export async function clickWord(page: Page, selector: string, word: string) {
  const { x, y } = await wordPoint(page, selector, word)
  await page.mouse.click(x, y)
}

export function wordPopup(page: Page) {
  return page.locator('[data-zenbu-word-popup]').locator('[data-word-popup]')
}

export async function openWordsPage(page: Page, extension: Extension, tone: Tone) {
  await page.goto(wordsPageUrl(extension, tone))
}
