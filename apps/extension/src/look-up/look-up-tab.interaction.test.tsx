import { rubySegments } from '@zenbu/dictionary-core/detail/ruby'
import type { ResultRow, SearchResultsScreen } from '@zenbu/dictionary-core/results/results'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lookup, SearchAnswer } from '../shared/dictionary'
import '../test/act-environment'
import { fakeChrome } from '../test/fake-chrome'
import { wordDetailLabels } from '../word-detail/labels'
import { lookUpLabels } from './labels'
import { LookUpTab } from './look-up-tab'

vi.mock('../shared/dictionary-progress', async () => {
  const { fakeDictionaryProgress } = await import('../test/data-state')
  return fakeDictionaryProgress
})

type Found = Extract<SearchResultsScreen, { state: 'results' }>

const word = (entSeq: number, headword: string, reading: string, summary: string): ResultRow => ({
  id: entSeq.toString(16).padStart(32, '0'),
  entSeq,
  headword,
  reading,
  ruby: rubySegments(headword, reading),
  summary,
  chips: [],
  retrievalOrder: 0
})

const taberu = word(1358280, '食べる', 'たべる', 'to eat')
const tabemono = word(1358300, '食べ物', 'たべもの', 'food')

const found = (query: string, rows: ResultRow[], more: Partial<Found> = {}): Found => ({
  state: 'results',
  query,
  sections: ['results'],
  examples: null,
  readingRefinement: null,
  kanji: null,
  rows,
  resultCount: rows.length,
  ...more
})

const screens = new Map<string, SearchResultsScreen>([
  ['食べる', found('食べる', [taberu])],
  ['たべる', found('たべる', [taberu, tabemono])],
  [
    'taberu',
    found('taberu', [taberu], {
      sections: ['readingRefinement', 'results'],
      readingRefinement: { query: 'たべる', title: 'Search for「たべる」' }
    })
  ],
  [
    '食',
    found('食', [tabemono], {
      sections: ['discoveredWords'],
      kanji: { character: '食', label: 'KANJI', summary: 'eat, food', entryId: null }
    })
  ]
])

const answer = (query: string): SearchAnswer => ({
  type: 'search',
  screen: screens.get(query) ?? { state: 'noResults', query }
})

let root: Root | undefined
let container: HTMLElement
const search = vi.fn(async (query: string): Lookup<SearchAnswer> => answer(query))
const open = vi.fn()

beforeEach(async () => {
  vi.stubGlobal('chrome', fakeChrome().chrome)
  container = document.body.appendChild(document.createElement('div'))
  await act(async () => {
    root = createRoot(container)
    root.render(<LookUpTab open={open} shown search={search} />)
  })
})

afterEach(() => {
  act(() => root?.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  search.mockClear()
  open.mockClear()
})

const box = () => container.querySelector('input') as HTMLInputElement

async function lookUp(text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(box(), text)
    box().dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => container.querySelector('form')?.requestSubmit())
}

const rows = () =>
  [...container.querySelectorAll('[data-result-row]')].map(listed => [
    Number(listed.getAttribute('data-result-row')),
    listed.querySelector('p')?.textContent
  ])
const row = (selector: string) =>
  container.querySelector(selector)?.closest('button') as HTMLElement
const click = (element: HTMLElement) => act(async () => element.click())

describe('Look Up', () => {
  it('has a search box with the app’s prompt and a Search button, and asks nothing before a search', () => {
    expect(container.querySelector('search form')).not.toBeNull()
    expect(box().getAttribute('aria-label')).toBe(lookUpLabels.box)
    expect(box().placeholder).toBe('Look up Japanese or English')
    expect(box().getAttribute('enterkeyhint')).toBe('search')
    expect(container.querySelector('button[type="submit"]')?.textContent).toBe('Search')
    expect(search).not.toHaveBeenCalled()
  })

  it.each([
    '食べる',
    'たべる',
    'taberu'
  ])('finds 食べる from %s, and its row opens its word card', async query => {
    await lookUp(query)
    expect(search).toHaveBeenCalledExactlyOnceWith(query)
    expect(rows()[0]).toEqual([1358280, 'to eat'])
    expect(container.querySelector('[data-result-row="1358280"] ruby')?.textContent).toContain('食')
    await click(row('[data-result-row="1358280"]'))
    expect(open).toHaveBeenCalledExactlyOnceWith({ page: 'word', entSeq: 1358280 })
  })

  it('lists every row the dictionary found, in its order', async () => {
    await lookUp('たべる')
    expect(rows()).toEqual([
      [1358280, 'to eat'],
      [1358300, 'food']
    ])
    expect(container.querySelector('[data-section="results"]')).not.toBeNull()
  })

  it('searches the trimmed text, asks nothing for an empty box, and asks again on each search', async () => {
    await lookUp('   ')
    expect(search).not.toHaveBeenCalled()
    await lookUp(' taberu ')
    await lookUp('taberu')
    expect(search.mock.calls).toEqual([['taberu'], ['taberu']])
  })

  it('searches the Japanese reading when its row is chosen', async () => {
    await lookUp('taberu')
    const refinement = container.querySelector('[data-section="readingRefinement"] button')
    expect(refinement?.textContent).toBe('Search for「たべる」')
    await click(refinement as HTMLElement)
    expect(search).toHaveBeenLastCalledWith('たべる')
    expect(box().value).toBe('たべる')
    expect(rows()).toHaveLength(2)
  })

  it('shows a kanji row over the discovered words, and it opens the kanji page', async () => {
    await lookUp('食')
    const listed = container.querySelector('[data-section="discoveredWords"]')
    expect(listed?.querySelector('h2')?.textContent).toBe(lookUpLabels.discovered)
    expect(container.querySelector('[data-kanji-row="食"]')?.textContent).toBe('KANJIeat, food')
    await click(row('[data-kanji-row="食"]'))
    expect(open).toHaveBeenCalledExactlyOnceWith({ page: 'kanji', character: '食' })
  })

  it('says No Dictionary Matches when nothing matches', async () => {
    await lookUp('zzzz')
    expect(container.querySelector('[data-search="no-results"]')?.textContent).toBe(
      'No Dictionary Matches'
    )
    expect(rows()).toEqual([])
  })

  it('shows the download while the dictionary is not ready', async () => {
    search.mockResolvedValueOnce({
      type: 'not-ready',
      data: { state: 'downloading', done: 1, total: 4 }
    })
    await lookUp('食べる')
    expect(container.querySelector('[data-progress="downloading"]')).not.toBeNull()
  })

  it('offers Try again when a search failed, and searches again from it', async () => {
    search.mockResolvedValueOnce({ type: 'failed', reason: 'The worker stopped.' })
    await lookUp('食べる')
    const failed = container.querySelector('[data-lookup="failed"]')
    expect(failed?.textContent).toContain(wordDetailLabels.lookup.failed)
    await click(failed?.querySelector('button') as HTMLElement)
    expect(search.mock.calls).toEqual([['食べる'], ['食べる']])
    expect(rows()).toEqual([[1358280, 'to eat']])
  })
})
