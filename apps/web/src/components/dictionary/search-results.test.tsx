import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { rubySegments } from '@zenbu/dictionary-core/detail/ruby'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import {
  type SearchData,
  type SearchExamplesData,
  type SearchWord,
  searchExamplesData
} from '@/lib/dictionary/data'
import type { KanjiDetailsData } from '@/lib/dictionary/kanji-details'
import { linkSearchScreen } from '@/lib/dictionary/results/links'
import { searchPath } from '@/lib/dictionary/urls'
import type { Locale } from '@/lib/i18n/config'
import { gateEnabled, gateService, recordedCases } from '@/test/gate'
import { fixtureKanji, unlinkedKanjiDetails } from '@/test/kanji-details'
import { readRenderedPage, visibleText } from '@/test/rendered'
import { SearchResults } from './search-results'

const render = (
  data: SearchData,
  examples: SearchExamplesData | null = null,
  locale: Locale = 'en'
) => renderToStaticMarkup(<SearchResults data={data} examples={examples} locale={locale} />)

function meaningClamp(): { fallback: number; lines: (rootPx: number) => number } {
  const css = readFileSync(
    createRequire(import.meta.url).resolve('@zenbu/ui/styles/theme.css'),
    'utf8'
  )
  const rule = css.match(/@utility meaning-clamp \{([\s\S]*?)\n\}/)?.[1] ?? ''
  const [fallback, computed] = [...rule.matchAll(/-webkit-line-clamp: ([^;{]+);/g)].map(
    ([, value]) => value
  )
  expect(rule).toMatch(/@supports[^{]*\{\s*-webkit-line-clamp: calc/)
  expect(computed).toMatch(/^calc\((?:[\d.\s+*/()-]|px|rem|max|sign|,)+\)$/)
  const lines = (rootPx: number) => {
    const expression = computed.replaceAll('1rem', `${rootPx}px`).replaceAll('px', '')
    const evaluate = new Function('calc', 'max', 'sign', `return ${expression}`)
    return evaluate((value: number) => value, Math.max, Math.sign) as number
  }
  return { fallback: Number(fallback), lines }
}

function word(
  entSeq: number,
  headword: string,
  reading: string,
  summary: string,
  chips: [string, string][]
): SearchWord {
  return {
    id: String(entSeq),
    entSeq,
    headword,
    reading,
    ruby: rubySegments(headword, reading),
    summary,
    chips: chips.map(([source, value]) => ({
      source,
      value,
      tier: 'veryCommon',
      spokenTier: null
    })),
    retrievalOrder: 0,
    path: `/dictionary/${headword}-${entSeq}/`
  }
}

const kanameRows = fixtureKanji('要')

const iru: SearchData = {
  state: 'results',
  query: 'iru',
  sections: ['examples', 'readingRefinement', 'results'],
  examples: {
    title: 'View 3 Example Sentences',
    count: 3,
    primaryEntry: '1546640',
    target: { kind: 'word', path: '/dictionary/要る-1546640/#examples' }
  },
  readingRefinement: {
    query: 'いる',
    title: 'Search for「いる」',
    path: '/dictionary/search/いる/'
  },
  kanji: null,
  rows: [
    word(1546640, '要る', 'いる', 'to be needed', [
      ['JLPT', 'N5'],
      ['YouTube', '949']
    ]),
    word(1577980, 'いる', 'いる', 'to be (of animate objects)', [['JLPT', 'N5']])
  ],
  resultCount: 2
}

const kaname: SearchData = {
  state: 'results',
  query: '要',
  sections: ['results'],
  examples: null,
  readingRefinement: null,
  kanji: {
    character: '要',
    label: 'KANJI',
    summary: 'pivot',
    entryId: 'x',
    details: unlinkedKanjiDetails(kanameRows)
  },
  rows: [],
  resultCount: 1
}

const noExamplesYet = (query: string): SearchExamplesData => ({
  query,
  examples: [],
  listed: 0,
  truncated: false,
  examplesPath: `${searchPath(query)}examples.json?build=b`
})

describe('the search results page on a Japanese page', () => {
  test('reads in Japanese, links within /ja/, and marks the English meanings as English', () => {
    const html = render(iru, null, 'ja')
    const page = readRenderedPage(html)
    expect(visibleText(html)).toContain('「iru」の検索結果：2語')
    expect(page.examples).toEqual({
      text: '例文を見る（3件）',
      href: '/ja/dictionary/要る-1546640/#examples'
    })
    expect(page.refinement).toBe('「いる」で検索')
    expect(html).toContain('aria-label="読み「いる」で検索"')
    expect(html).toContain('href="/ja/dictionary/search/いる/"')
    expect(html).toContain('<p class="meaning-clamp text-sm" lang="en">to be needed</p>')
    expect(html).toContain('href="/ja/dictionary/要る-1546640/"')
  })

  test('the KANJI row and its details read in Japanese', () => {
    const html = render(kaname, null, 'ja')
    expect(readRenderedPage(html).kanji).toEqual({ character: '要', text: '漢字 pivot' })
    expect(html).toContain('aria-label="要、漢字、pivot、漢字の詳細を表示"')
    expect(visibleText(html)).toContain('読み方 音読みヨウ')
    expect(html).toContain('aria-label="要の書き順を見る"')
  })

  test('says in Japanese when nothing matches', () => {
    expect(
      readRenderedPage(render({ state: 'noResults', query: 'qzxvkj' }, null, 'ja')).noResults
    ).toBe('一致する言葉は見つかりませんでした')
  })
})

describe('the search results page', () => {
  test('shows the Example Sentences row, the reading refinement, then the rows in order with their chips', () => {
    const html = render(iru)
    const page = readRenderedPage(html)
    expect(page.sections).toEqual(['examples', 'readingRefinement', 'results'])
    expect(page.examples).toEqual({
      text: 'View 3 Example Sentences',
      href: '/dictionary/要る-1546640/#examples'
    })
    expect(page.refinement).toBe('Search for「いる」')
    expect(html).toContain('href="/dictionary/search/いる')
    expect(page.kanji).toBeNull()
    expect(page.rows).toEqual([
      {
        entSeq: 1546640,
        headword: '要る',
        summary: 'to be needed',
        chips: ['JLPT N5', 'YouTube 949']
      },
      {
        entSeq: 1577980,
        headword: 'いる',
        summary: 'to be (of animate objects)',
        chips: ['JLPT N5']
      }
    ])
  })

  test('leads a one-kanji query with the KANJI row and its primary entry’s meaning', () => {
    const html = render({
      state: 'results',
      query: '要',
      sections: ['results'],
      examples: null,
      readingRefinement: null,
      kanji: {
        character: '要',
        label: 'KANJI',
        summary: 'pivot, vital point, key point',
        entryId: 'x',
        details: null
      },
      rows: [word(1609600, '必要', 'ひつよう', 'necessary', [['JLPT', 'N4']])],
      resultCount: 2
    })
    const page = readRenderedPage(html)
    expect(page.kanji).toEqual({ character: '要', text: 'KANJI pivot, vital point, key point' })
    expect(html.indexOf('data-kanji-row')).toBeLessThan(html.indexOf('data-result-row'))
    expect(page.rows.map(row => row.headword)).toEqual(['必要'])
    expect(html).not.toContain('data-kanji-details')
    expect(html).not.toContain('shows kanji details')
  })

  test('the KANJI row opens to the kanji’s details when the dictionary has them', () => {
    const html = render(kaname)
    expect(readRenderedPage(html).kanji).toEqual({ character: '要', text: 'KANJI pivot' })
    const button = html.match(/<button([^>]*)><span lang="ja" class="text-4xl/)?.[1] ?? ''
    expect(button).toContain('aria-expanded="false"')
    expect(button).toContain('aria-label="要, kanji, pivot, shows kanji details"')
    const panel = button.match(/aria-controls="([^"]+)"/)?.[1]
    const details = html.slice(html.indexOf(`<div id="${panel}" hidden="">`))
    expect(details).toMatch(/^<div id="[^"]+" hidden=""><div[^>]*><div[^>]*data-kanji-details="要"/)
    expect(visibleText(details)).toContain('need, main point, essence, pivot, key to')
    expect(visibleText(details)).toContain('Readings Onヨウ')
    expect(details).toContain('aria-label="Show stroke order for 要"')
  })

  test('says No Dictionary Matches, as the app does, when nothing matches', () => {
    const page = readRenderedPage(render({ state: 'noResults', query: 'qzxvkj' }))
    expect(page.noResults).toBe('No Dictionary Matches')
    expect(page.rows).toEqual([])
  })

  test('clamps each meaning to two lines, and lifts the clamp with large text, as the app does', () => {
    const html = render({
      state: 'results',
      query: 'x',
      sections: ['results'],
      examples: null,
      readingRefinement: null,
      kanji: null,
      rows: [word(1, '語', 'ご', 'word', [])],
      resultCount: 1
    })
    expect(html).toContain('<p class="meaning-clamp text-sm">word</p>')
    const rule = meaningClamp()
    expect(rule.fallback).toBe(2)
    for (const rootPx of [12, 16, 20, (16 * 23) / 17]) expect(rule.lines(rootPx)).toBe(2)
    for (const rootPx of [22, 24, (16 * 28) / 17, 32]) {
      expect(rule.lines(rootPx)).toBeGreaterThan(900)
    }
  })

  test('shows only the Example Sentences when only sentences match', () => {
    const page = readRenderedPage(
      render(
        {
          state: 'results',
          query: 'it is',
          sections: ['examples'],
          examples: {
            title: 'View 50+ Example Sentences',
            count: 51,
            primaryEntry: null,
            target: { kind: 'inline' }
          },
          readingRefinement: null,
          kanji: null,
          rows: [],
          resultCount: 0
        },
        noExamplesYet('it is')
      )
    )
    expect(page.sections).toEqual(['examples', 'searchExamples'])
    expect(page.rows).toEqual([])
  })

  test('an English search lists its Example Sentences below the words, and its row links down to them', () => {
    const data: SearchData = {
      state: 'results',
      query: 'eat',
      sections: ['examples', 'results'],
      examples: {
        count: 51,
        title: 'View 50+ Example Sentences',
        primaryEntry: null,
        target: { kind: 'inline' }
      },
      readingRefinement: null,
      kanji: null,
      rows: [word(1358280, '食べる', 'たべる', 'to eat', [])],
      resultCount: 1
    }
    const html = render(data, noExamplesYet('eat'))
    const page = readRenderedPage(html)
    expect(page.sections).toEqual(['examples', 'results', 'searchExamples'])
    expect(page.examples).toEqual({ text: 'View 50+ Example Sentences', href: '#examples' })
    expect(html).toMatch(/<div[^>]* id="examples"[^>]*data-section="searchExamples"/)
    expect(readRenderedPage(render(data)).sections).toEqual(['results'])
  })

  test('lists a sentence’s Discovered Words, below its Example Sentences row', () => {
    const html = render({
      state: 'results',
      query: '日本語を勉強する',
      sections: ['examples', 'discoveredWords'],
      examples: {
        count: 3,
        title: 'View 3 Example Sentences',
        primaryEntry: null,
        target: { kind: 'word', path: '/dictionary/日本語-1464530/#examples' }
      },
      readingRefinement: null,
      kanji: null,
      rows: [word(1464530, '日本語', 'にほんご', 'Japanese (language)', [])],
      resultCount: 1
    })
    const page = readRenderedPage(html)
    expect(page.sections).toEqual(['examples', 'discoveredWords'])
    expect(page.heading).toBe('Discovered Words')
    expect(page.examples?.href).toBe('/dictionary/日本語-1464530/#examples')
    expect(page.rows.map(row => row.headword)).toEqual(['日本語'])
  })
})

interface SuiteCase {
  query: string
  state?: string
  sections?: string[]
  examples?: { title: string; count: number }
  readingRefinement?: { title: string }
  heading?: string
  kanji?: { character: string; label: string; summary: string }
  results?: {
    entSeq: string[]
    headword: string
    summary: string
    chips: { name: string; text: string }[]
  }[]
}

const renderedQueries = ['iru', 'いる', '日', 'eat', 'かえる', 'い', 'qzxvkj']

const renderedSentences = [
  '猫が好き',
  '悪い子ね！',
  '現段階では、ソフトのバグ改修のみ行っています。機能強化については承っておりません。'
]

const suiteCases = [
  ...recordedCases<SuiteCase>('search-results.json').filter(expected =>
    renderedQueries.includes(expected.query)
  ),
  ...recordedCases<SuiteCase>('sentence-results.json').filter(expected =>
    renderedSentences.includes(expected.query)
  )
]

async function serviceKanji(character: string): Promise<KanjiDetailsData | null> {
  const found = await gateService().kanji(character)
  return found ? unlinkedKanjiDetails(found.data.rows) : null
}

async function inlineExamples(data: SearchData): Promise<SearchExamplesData | null> {
  if (data.state !== 'results' || data.examples?.target.kind !== 'inline') return null
  const found = await gateService().searchExamples(data.query)
  return found ? searchExamplesData(found) : null
}

describe.runIf(gateEnabled)('the rendered search results page matches the app', () => {
  test('renders every chosen case', () => {
    expect(suiteCases.map(expected => expected.query).sort()).toEqual(
      [...renderedQueries, ...renderedSentences].sort()
    )
  })

  test.each(suiteCases)('「$query」', async expected => {
    const { screen } = (await gateService().search(expected.query)).data
    const kanji =
      screen.state === 'results' && screen.kanji ? await serviceKanji(screen.kanji.character) : null
    const data = linkSearchScreen(screen, { dictionaryLoaded: true, kanji })
    const examples = await inlineExamples(data)
    const html = render(data, examples)
    const page = readRenderedPage(html)
    for (const row of data.state === 'results' ? data.rows : []) {
      expect(html).toContain(`href="${row.path ?? ''}"`)
    }

    if (expected.state === 'noResults') {
      expect(page.noResults).toMatch(/^No Dictionary Matches/)
      return
    }
    if (data.state !== 'results') throw new Error(`「${expected.query}」 has no results`)
    expect(page.sections.filter(section => section !== 'searchExamples')).toEqual(
      expected.sections ?? []
    )
    const target = data.examples?.target
    expect(page.examples).toEqual(
      expected.examples
        ? {
            text: expected.examples.title,
            href: target?.kind === 'word' ? target.path : '#examples'
          }
        : null
    )
    if (target?.kind === 'word') expect(target.path).toMatch(/^\/dictionary\/[^/]+-\d+\/#examples$/)
    expect(page.sections.includes('searchExamples')).toBe(target?.kind === 'inline')
    expect(page.refinement).toBe(expected.readingRefinement?.title ?? null)
    expect(page.heading).toBe(expected.heading ?? null)
    expect(page.kanji).toEqual(
      expected.kanji
        ? {
            character: expected.kanji.character,
            text: `${expected.kanji.label} ${expected.kanji.summary}`
          }
        : null
    )
    if (data.kanji) {
      expect(html.includes(`data-kanji-details="${data.kanji.character}"`)).toBe(kanji !== null)
    }
    const expectedRows = (expected.results ?? []).map(row => ({
      entSeq: Number(row.entSeq[0]),
      headword: row.headword,
      summary: row.summary,
      chips: row.chips.map(chip => `${chip.name} ${chip.text}`)
    }))
    expect(page.rows).toEqual(expectedRows)
    expect(visibleText(html)).toMatch(new RegExp(`^${expectedRows.length} words? for `))
  })
})
