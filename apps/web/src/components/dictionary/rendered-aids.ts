// Reads what Reading Aids show on a rendered word page, under each setting, from its
// server-rendered HTML, for the rendered-page test (reading-aids.test.tsx): the headline's
// furigana, romaji, and reading without furigana; each related word's and alternative reading's
// romaji; and each example's romaji, word meanings, and translation. It first removes what the
// setting hides (`asShown`), then reads the rest as a reader sees it (happy-dom). Test-only.

import { Window } from 'happy-dom'
import type { ReadingAidSettings } from '@/lib/dictionary/detail/reading-aids'
import { asShown } from './rendered'

function parse(html: string, settings: ReadingAidSettings) {
  const { document } = new Window()
  document.body.innerHTML = asShown(html, settings)
  return document
}

type Document = ReturnType<typeof parse>
type Node = NonNullable<ReturnType<Document['querySelector']>>

const textOf = (node: Node | null) => node?.textContent?.trim() ?? null

/** Every Reading Aid's element and its class, to hold each to the class that hides it. */
export function readAidMarkup(html: string): { kind: string; className: string }[] {
  const { document } = new Window()
  document.body.innerHTML = html
  return [...document.querySelectorAll('[data-reading-aid]')].map(node => ({
    kind: node.getAttribute('data-reading-aid') ?? '',
    className: node.getAttribute('class') ?? ''
  }))
}

/** The headline under a setting: whether it has furigana, and the aids under it. */
export function readHeadline(html: string, settings: ReadingAidSettings) {
  const document = parse(html, settings)
  const headline = document.querySelector('[data-headline]')
  return {
    furigana: (headline?.querySelectorAll('rt').length ?? 0) > 0,
    romaji: textOf(headline?.querySelector('[data-reading-aid="romaji"]') ?? null),
    readingWithoutFurigana: textOf(
      headline?.querySelector('[data-reading-aid="readingWithoutFurigana"]') ?? null
    )
  }
}

/** The romaji under each item a selector finds (related words, alternative forms), or null. */
export function readRomajiOf(html: string, selector: string, settings: ReadingAidSettings) {
  const document = parse(html, settings)
  return [...document.querySelectorAll(selector)].map(node =>
    textOf(node.querySelector('[data-reading-aid="romaji"]'))
  )
}

/** Each example under a setting: its romaji line, the meanings under its words, and its translation. */
export function readExampleAids(html: string, settings: ReadingAidSettings) {
  const document = parse(html, settings)
  return [...document.querySelectorAll('li')].map(item => ({
    romaji: textOf(item.querySelector('[data-reading-aid="romaji"]')),
    meanings: [...item.querySelectorAll('[data-reading-aid="wordMeaning"]')].map(
      node => node.textContent?.trim() ?? ''
    ),
    translation: textOf(item.querySelector('[data-reading-aid="translation"]')),
    furigana: item.querySelectorAll('rt').length
  }))
}
