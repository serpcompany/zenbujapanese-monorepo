import type {
  BrowseWord,
  BrowseWordsResponse,
  CategoryOrder,
  KanaInitialResponse,
  WordLink
} from '@zenbu/dictionary-core/artifact/browse'
import type { DictionaryContract } from '@zenbu/dictionary-core/artifact/contract'
import type { KanaScript } from '@zenbu/dictionary-core/browse/kana'
import {
  type BrowseAnswer,
  type BrowsePath,
  browseService
} from '@zenbu/dictionary-core/browse/service-paths'
import { fixtureBrowseAnswers } from '@zenbu/dictionary-core/fixtures'
import { cache } from 'react'
import { dictionaryService } from '../data'
import { linkedWordPath } from '../results/links'

export type Linked<T> = T & { path: string | null }

export type BrowseWordsPage = Omit<BrowseWordsResponse, 'words'> & { words: Linked<BrowseWord>[] }

export type KanaInitialPage = Omit<KanaInitialResponse, 'words'> & {
  words: Linked<BrowseWord>[]
}

interface Answered<T> {
  data: T
  dictionaryLoaded: boolean
}

async function answer<Name extends BrowseAnswer>(
  path: BrowsePath<Name>
): Promise<Answered<DictionaryContract[Name]> | null> {
  const api = await dictionaryService()
  if (api) {
    const found = await api.browse(path)
    return found ? { data: found.data, dictionaryLoaded: true } : null
  }
  const fixture = fixtureBrowseAnswers[path.path] as DictionaryContract[Name] | undefined
  return fixture ? { data: fixture, dictionaryLoaded: false } : null
}

async function required<Name extends BrowseAnswer>(
  path: BrowsePath<Name>
): Promise<Answered<DictionaryContract[Name]>> {
  const found = await answer(path)
  if (!found) throw new Error(`The dictionary has no ${path.path}`)
  return found
}

const linked = <T extends WordLink>(words: readonly T[], dictionaryLoaded: boolean) =>
  words.map(word => ({ ...word, path: linkedWordPath(word, dictionaryLoaded) }))

function wordsPage(found: Answered<BrowseWordsResponse> | null): BrowseWordsPage | null {
  return found ? { ...found.data, words: linked(found.data.words, found.dictionaryLoaded) } : null
}

export const getBrowseSummary = cache(async () => {
  const { data, dictionaryLoaded } = await required(browseService.summary())
  return { ...data, commonWords: linked(data.commonWords, dictionaryLoaded) }
})

export const getKanaIndex = cache(
  async (script: KanaScript) => (await required(browseService.kanaIndex(script))).data
)

export const getKanaInitial = cache(
  async (script: KanaScript, initial: string): Promise<KanaInitialPage | null> => {
    const found = await answer(browseService.kanaInitial(script, initial))
    return found ? { ...found.data, words: linked(found.data.words, found.dictionaryLoaded) } : null
  }
)

export const getKanaWords = cache(async (script: KanaScript, prefix: string, page: number) =>
  wordsPage(await answer(browseService.kanaWords(script, prefix, page)))
)

export const getCategoryCounts = cache(
  async () => (await required(browseService.categories())).data.categories
)

export const getCategoryWords = cache(async (slug: string, order: CategoryOrder, page: number) =>
  wordsPage(await answer(browseService.categoryWords(slug, order, page)))
)

export const getRankedLists = cache(async () => {
  const { data, dictionaryLoaded } = await required(browseService.rankedLists())
  return {
    lists: data.lists.map(list => ({ ...list, top: linked(list.top, dictionaryLoaded) })),
    jlpt: data.jlpt.map(list => ({ ...list, first: linked(list.first, dictionaryLoaded) }))
  }
})

export const getRankedWords = cache(async (slug: string, page: number) =>
  wordsPage(await answer(browseService.rankedWords(slug, page)))
)

export const getKanjiHub = cache(async () => (await required(browseService.kanjiHub())).data)

export const getKanjiList = cache(
  async (slug: string) => (await answer(browseService.kanjiList(slug)))?.data ?? null
)
