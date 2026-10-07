import {
  browseCategories,
  browseCategory,
  type CategoryOrder,
  commonWords
} from '../browse/categories'
import { type KanaScript, kanaScriptOf, kanaScripts } from '../browse/kana'
import {
  browsePageSize,
  gradeLists,
  jinmeiyo,
  jlptKanjiLists,
  jlptList,
  jlptLists,
  pageCount,
  type RankedList,
  rankBand,
  rankBands,
  rankedList,
  rankedListLimit,
  rankedLists,
  schoolLists,
  strokeList
} from '../browse/lists'
import {
  BrowseIndex,
  type CategoryCount,
  type CategoryMembers,
  type KanaCount
} from './browse-index'
import {
  type KanjiHubResponse,
  type KanjiListResponse,
  kanjiHub,
  kanjiListResponse
} from './browse-kanji'
import {
  jlptRowids,
  type RankedCounts,
  rankedBandCounts,
  rankedCounts,
  rankedRows
} from './browse-ranked'
import {
  type BrowseWord,
  browseWords,
  contentWordRowids,
  scriptFilter,
  type WordLink,
  wordLinks
} from './browse-words'
import type { ArtifactDatabase } from './database'
import type { KanjiData } from './kanji-data'

export type { KanaCount } from './browse-index'
export type { KanjiHubResponse, KanjiListResponse } from './browse-kanji'
export type { BrowseWord, WordLink } from './browse-words'

export interface BrowseWordsResponse {
  total: number
  page: number
  pages: number
  words: BrowseWord[]
}

export interface KanaIndexResponse {
  script: KanaScript
  total: number
  initials: KanaCount[]
}

export interface KanaInitialResponse {
  script: KanaScript
  initial: string
  total: number
  previous: string | null
  next: string | null
  prefixes: KanaCount[]
  words: BrowseWord[]
}

export interface BrowseSummaryResponse {
  entries: number
  scripts: Record<KanaScript, number>
  common: number
  commonWords: WordLink[]
  kanji: { joyo: number; jinmeiyo: number; grades: { slug: string; count: number }[] }
  firstGrade: string[]
  jlpt: { slug: string; count: number }[]
}

export interface CategoryCountsResponse {
  categories: CategoryCount[]
}

export interface RankedListsResponse {
  lists: { slug: string; mapped: number; listed: number; top: WordLink[] }[]
  jlpt: { slug: string; count: number; first: WordLink[] }[]
}

export interface BrowseSitemapResponse {
  kana: { initial: string; count: number; prefixes: KanaCount[] }[]
  categories: CategoryCount[]
  rankedLists: { slug: string; bands: number[] }[]
  jlptLists: { slug: string; count: number }[]
  kanjiLists: { slug: string; count: number }[]
}

const commonWordsShown = 24
const topWordsShown = 6
const firstJlptWordsShown = 5
const isSingleCodePoint = (value: string) => Array.from(value).length === 1

const allKanjiListSlugs = (hub: KanjiHubResponse) => [
  ...schoolLists.map(list => list.slug),
  ...jlptKanjiLists.map(list => list.slug),
  ...hub.strokes.map(({ strokes }) => strokeList(strokes).slug)
]

export class DictionaryBrowse {
  private readonly jlptWords = new Map<number, number[]>()
  private indexed: BrowseIndex | null = null
  private readonly kanaIndexes = new Map<KanaScript, KanaIndexResponse>()
  private readonly rankedTotals = new Map<string, RankedCounts>()
  private readonly kanjiLists = new Map<string, KanjiListResponse | null>()
  private summaryAnswer: BrowseSummaryResponse | null = null
  private rankedAnswer: RankedListsResponse | null = null
  private kanjiAnswer: KanjiHubResponse | null = null
  private sitemapAnswer: BrowseSitemapResponse | null = null

  constructor(
    private readonly db: ArtifactDatabase,
    private readonly kanji: KanjiData
  ) {}

  private jlptLevel(level: number): number[] {
    const cached = this.jlptWords.get(level)
    if (cached) return cached
    const rowids = jlptRowids(this.db, level)
    this.jlptWords.set(level, rowids)
    return rowids
  }

  private index(): BrowseIndex {
    this.indexed ??= new BrowseIndex(this.db)
    return this.indexed
  }

  private rankedTotal(list: RankedList): RankedCounts {
    const cached = this.rankedTotals.get(list.slug)
    if (cached) return cached
    const counts = rankedCounts(this.db, list)
    this.rankedTotals.set(list.slug, counts)
    return counts
  }

  warm(): void {
    this.summary()
    this.sitemap()
    for (const slug of allKanjiListSlugs(this.kanjiHub())) this.kanjiList(slug)
    for (const list of [...rankedLists, ...jlptLists]) this.rankedWords(list.slug, 1)
    this.warmLaterMeaningPage()
  }

  private warmLaterMeaningPage(): void {
    for (const { slug } of browseCategories) {
      const members = this.index().category(slug)
      const [rowid] = members?.labelledSense.keys() ?? []
      if (members && rowid !== undefined) {
        const position = members.kana.indexOf(rowid)
        this.categoryWords(slug, 'kana', Math.floor(position / browsePageSize) + 1)
        return
      }
    }
  }

  private page(
    rowids: ArrayLike<number>,
    page: number,
    labelledSense?: ReadonlyMap<number, number>
  ): BrowseWordsResponse | null {
    const pages = pageCount(rowids.length)
    if (rowids.length === 0 || page < 1 || page > pages) return null
    const start = (page - 1) * browsePageSize
    const shown = Array.from(
      { length: Math.min(browsePageSize, rowids.length - start) },
      (_, index) => rowids[start + index]
    )
    return {
      total: rowids.length,
      page,
      pages,
      words: browseWords(this.db, shown, { labelledSense })
    }
  }

  kanaIndex(script: KanaScript): KanaIndexResponse {
    const cached = this.kanaIndexes.get(script)
    if (cached) return cached
    const filter = scriptFilter(script)
    const initials = this.db.all<KanaCount>(
      `SELECT substr(e.reading, 1, 1) AS kana, count(*) AS count FROM entries e
       WHERE ${filter.where} GROUP BY kana ORDER BY kana`,
      filter.params
    )
    const index = { script, total: initials.reduce((sum, { count }) => sum + count, 0), initials }
    this.kanaIndexes.set(script, index)
    return index
  }

  kanaInitial(script: KanaScript, initial: string): KanaInitialResponse | null {
    if (!isSingleCodePoint(initial) || kanaScriptOf(initial) !== script) return null
    const { initials } = this.kanaIndex(script)
    const position = initials.findIndex(({ kana }) => kana === initial)
    if (position < 0) return null
    const index = this.index()
    return {
      script,
      initial,
      total: initials[position].count,
      previous: initials[position - 1]?.kana ?? null,
      next: initials[position + 1]?.kana ?? null,
      prefixes: index.prefixesOf(initial),
      words: browseWords(this.db, index.readAs(initial))
    }
  }

  kanaWords(script: KanaScript, prefix: string, page: number): BrowseWordsResponse | null {
    if (Array.from(prefix).length !== 2 || kanaScriptOf(prefix) !== script) return null
    return this.page(this.index().startingWith(prefix), page)
  }

  categoryCounts(): CategoryCountsResponse {
    return { categories: this.index().categoryCounts() }
  }

  private categoryMembers(slug: string): CategoryMembers | null {
    return browseCategory(slug) ? this.index().category(slug) : null
  }

  categoryWords(slug: string, order: CategoryOrder, page: number): BrowseWordsResponse | null {
    const members = this.categoryMembers(slug)
    return members ? this.page(members[order], page, members.labelledSense) : null
  }

  rankedWords(slug: string, page: number): BrowseWordsResponse | null {
    const jlpt = jlptList(slug)
    if (jlpt) {
      return this.page(this.jlptLevel(jlpt.level), page)
    }
    const list = rankedList(slug)
    if (!list || page < 1 || page > rankBands) return null
    const { listed } = this.rankedTotal(list)
    if (listed === 0) return null
    const { first, last } = rankBand(page)
    const rows = rankedRows(this.db, list, first, last)
    return {
      total: listed,
      page,
      pages: rankBands,
      words: browseWords(
        this.db,
        rows.map(row => row.rowid),
        { ranks: new Map(rows.map(row => [row.rowid, row.rank])) }
      )
    }
  }

  rankedLists(): RankedListsResponse {
    this.rankedAnswer ??= {
      lists: rankedLists.map(list => ({
        slug: list.slug,
        ...this.rankedTotal(list),
        top: wordLinks(
          this.db,
          rankedRows(this.db, list, 1, rankedListLimit, topWordsShown).map(row => row.rowid)
        )
      })),
      jlpt: jlptLists.map(list => {
        const rowids = this.jlptLevel(list.level)
        return {
          slug: list.slug,
          count: rowids.length,
          first: wordLinks(this.db, rowids.slice(0, firstJlptWordsShown))
        }
      })
    }
    return this.rankedAnswer
  }

  kanjiHub(): KanjiHubResponse {
    this.kanjiAnswer ??= kanjiHub(this.kanji)
    return this.kanjiAnswer
  }

  kanjiList(slug: string): KanjiListResponse | null {
    const cached = this.kanjiLists.get(slug)
    if (cached !== undefined) return cached
    const answer = kanjiListResponse(this.kanji, slug)
    if (answer) this.kanjiLists.set(slug, answer)
    return answer
  }

  summary(): BrowseSummaryResponse {
    if (this.summaryAnswer) return this.summaryAnswer
    const [{ count: entries }] = this.db.all<{ count: number }>(
      'SELECT count(*) AS count FROM entries'
    )
    const common = this.index().category(commonWords.slug)?.used ?? new Int32Array()
    const hub = this.kanjiHub()
    const sizeOf = (slug: string) =>
      hub.lists.find(list => list.slug === slug)?.characters.length ?? 0
    const grades = hub.lists.filter(list => list.slug !== jinmeiyo.slug)
    this.summaryAnswer = {
      entries,
      scripts: {
        hiragana: this.kanaIndex('hiragana').total,
        katakana: this.kanaIndex('katakana').total
      },
      common: common.length,
      commonWords: wordLinks(this.db, contentWordRowids(this.db, common, commonWordsShown)),
      kanji: {
        joyo: grades.reduce((sum, list) => sum + list.characters.length, 0),
        jinmeiyo: sizeOf(jinmeiyo.slug),
        grades: grades.map(list => ({ slug: list.slug, count: list.characters.length }))
      },
      firstGrade: hub.lists.find(list => list.slug === gradeLists[0].slug)?.characters ?? [],
      jlpt: this.rankedLists().jlpt.map(({ slug, count }) => ({ slug, count }))
    }
    return this.summaryAnswer
  }

  sitemap(): BrowseSitemapResponse {
    if (this.sitemapAnswer) return this.sitemapAnswer
    const index = this.index()
    const ranked = this.rankedLists()
    const hub = this.kanjiHub()
    this.sitemapAnswer = {
      kana: kanaScripts.flatMap(script =>
        this.kanaIndex(script).initials.map(({ kana: initial, count }) => ({
          initial,
          count,
          prefixes: index.prefixesOf(initial)
        }))
      ),
      categories: this.categoryCounts().categories,
      rankedLists: rankedLists
        .filter(list => this.rankedTotal(list).listed > 0)
        .map(list => ({ slug: list.slug, bands: rankedBandCounts(this.db, list) })),
      jlptLists: ranked.jlpt.map(({ slug, count }) => ({ slug, count })),
      kanjiLists: allKanjiListSlugs(hub).flatMap(slug => {
        const count = this.kanjiList(slug)?.kanji.length ?? 0
        return count > 0 ? [{ slug, count }] : []
      })
    }
    return this.sitemapAnswer
  }
}
