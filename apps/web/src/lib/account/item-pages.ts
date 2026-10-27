import { maximumPagesAsked } from '@zenbu/dictionary-core/artifact/pages'
import { isLanguageReferenceId } from '@zenbu/dictionary-core/cards/word-list'
import type { PagePaths } from '../dictionary/pages-answer'

const pagesPath = '/dictionary/pages.json'

const kanjiItem = 'kanji:'

const askedAtOnce = 6

export interface ItemPages {
  paths: ReadonlyMap<string, string>
  missing: ReadonlySet<string>
}

export const noItemPages: ItemPages = { paths: new Map(), missing: new Set() }

type Fetch = (url: string) => Promise<Response>

interface Ask {
  words: string[]
  kanji: string[]
}

function asks(itemIds: Iterable<string>): Ask[] {
  const unique = [...new Set(itemIds)]
  const words = unique.filter(isLanguageReferenceId)
  const kanji = unique.flatMap(id => {
    const character = id.startsWith(kanjiItem) ? id.slice(kanjiItem.length) : ''
    return Array.from(character).length === 1 && character !== ',' ? [character] : []
  })
  const count = Math.ceil(Math.max(words.length, kanji.length) / maximumPagesAsked)
  const part = (all: string[], index: number) =>
    all.slice(index * maximumPagesAsked, (index + 1) * maximumPagesAsked)
  return Array.from({ length: count }, (_, index) => ({
    words: part(words, index),
    kanji: part(kanji, index)
  }))
}

async function answer(ask: Ask, fetcher: Fetch): Promise<PagePaths | null> {
  const query = new URLSearchParams({ words: ask.words.join(','), kanji: ask.kanji.join(',') })
  try {
    const response = await fetcher(`${pagesPath}?${query}`)
    return response.ok ? ((await response.json()) as PagePaths) : null
  } catch {
    return null
  }
}

export async function readItemPages(
  itemIds: Iterable<string>,
  fetcher: Fetch = url => fetch(url)
): Promise<ItemPages> {
  const paths = new Map<string, string>()
  const missing = new Set<string>()
  const place = (id: string, path: string | undefined) =>
    path === undefined ? missing.add(id) : paths.set(id, path)
  const waiting = asks(itemIds)
  for (let from = 0; from < waiting.length; from += askedAtOnce) {
    const batch = waiting.slice(from, from + askedAtOnce)
    const answers = await Promise.all(batch.map(ask => answer(ask, fetcher)))
    answers.forEach((found, index) => {
      if (!found) return
      for (const word of batch[index].words) place(word, found.words[word])
      for (const character of batch[index].kanji) {
        place(`${kanjiItem}${character}`, found.kanji[character])
      }
    })
  }
  return { paths, missing }
}
