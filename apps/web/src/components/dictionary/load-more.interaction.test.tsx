// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SearchWord } from '@/lib/dictionary/data'
import { rubySegments } from '@/lib/dictionary/detail/ruby'
import { ResultRows } from './search-result-rows'

// A paged list in a DOM: the Load more button and the list scrolling into view (the
// IntersectionObserver) at once load the next page once, and every word shows once, in order.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
/** The list's observer callback, which the test calls as scrolling would. */
let intersect: (() => void) | null = null

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  container = document.getElementById('root') as HTMLDivElement
  root = createRoot(container)
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = () => callback([{ isIntersecting: true }])
      }
      observe() {}
      disconnect() {}
    }
  )
})

afterEach(() => {
  act(() => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  intersect = null
})

const word = (entSeq: number): SearchWord => ({
  id: String(entSeq),
  entSeq,
  headword: '語',
  reading: 'ご',
  ruby: rubySegments('語', 'ご'),
  romaji: 'go',
  summary: `word ${entSeq}`,
  chips: [],
  retrievalOrder: entSeq,
  path: null
})

const shown = () =>
  [...container.querySelectorAll('[data-result-row]')].map(row =>
    Number(row.getAttribute('data-result-row'))
  )

describe('a paged list', () => {
  test('a click and scrolling into view at once load the next page once', async () => {
    let answer: (response: Response) => void = () => {}
    const fetcher = vi.fn(
      (_url: string) =>
        new Promise<Response>(resolve => {
          answer = resolve
        })
    )
    vi.stubGlobal('fetch', fetcher)
    const initial = Array.from({ length: 25 }, (_, index) => word(index))
    act(() =>
      root.render(
        <ResultRows initial={initial} total={30} path="/r.json?build=b" afterKanji={false} />
      )
    )
    const button = [...container.querySelectorAll('button')].find(
      candidate => candidate.textContent === 'Load more words'
    )
    if (!button || !intersect) throw new Error('No Load more button or observer')
    const scroll = intersect
    await act(async () => {
      button.click()
      scroll()
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('/r.json?build=b&from=25')
    await act(async () => {
      answer(Response.json({ rows: [25, 26, 27, 28, 29].map(word) }))
    })
    expect(shown()).toEqual(Array.from({ length: 30 }, (_, index) => index))
    // Every word is shown, so there is nothing more to load.
    expect(container.textContent).not.toContain('Load more words')
  })
})
