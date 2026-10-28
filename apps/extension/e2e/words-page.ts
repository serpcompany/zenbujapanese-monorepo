import type { Page } from '@playwright/test'
import { wordPath } from '@zenbu/dictionary-core/detail/word-path'
import { highlightNames, type Tone } from '../src/page-lookup/underline.ts'
import { readingAidKeys, type Settings, settingDefaults } from '../src/shared/settings.ts'
import type { Extension } from './fixtures.ts'

export { highlightNames }

export const tones: Tone[] = ['light', 'dark']

export const underlineColors: Record<Tone, string> = {
  light: 'rgb(37, 99, 235)',
  dark: 'rgb(96, 165, 250)'
}

export const allowedHost = 'allowed.localhost'

export const darkTextColours = ['oklch(0.985 0 0)', 'color(display-p3 1 1 1)']

const wordsPageUrl = (extension: Extension, tone: Tone, colour: string) =>
  `${extension.server.allowedSiteUrl}/test-pages/words.html${tone === 'dark' ? `?dark=${encodeURIComponent(colour)}` : ''}`

export const noReadingAids: Partial<Settings> = {
  'readingAids.furigana': false,
  'readingAids.romaji': false,
  'readingAids.wordMeanings': false,
  'sites.off': []
}

export const defaultReadingAids: Partial<Settings> = {
  ...Object.fromEntries(readingAidKeys.map(key => [key, settingDefaults[key]])),
  'sites.off': []
}

export const readingAidCases = [
  { name: 'with every reading aid off', aids: noReadingAids },
  { name: 'with the default settings, Furigana on', aids: defaultReadingAids }
]

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

function wordPoint(page: Page, selector: string, word: string) {
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

export const addedWords = { ...pageWords, added: ['要項'] }

export function addWordLater(page: Page) {
  return page.evaluate(() => {
    const later = document.querySelector('#later')
    later?.append(Object.assign(document.createElement('p'), { id: 'added', textContent: '要項' }))
  })
}

export async function openWordsPage(page: Page, extension: Extension, tone: Tone, colour = '') {
  await page.goto(wordsPageUrl(extension, tone, colour))
}
