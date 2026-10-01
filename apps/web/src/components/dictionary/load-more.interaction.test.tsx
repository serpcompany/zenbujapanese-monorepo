import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { PageExample } from '@/lib/dictionary/page-example'
import { ExampleList } from './example-list'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
let scrollListIntoView: (() => void) | null = null

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  container = document.getElementById('root') as HTMLDivElement
  root = createRoot(container)
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        scrollListIntoView = () => callback([{ isIntersecting: true }])
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
  scrollListIntoView = null
})

const example = (position: number): PageExample => ({
  position,
  pairId: position.toString(16),
  text: '見る。',
  tokens: [],
  translation: `Example ${position}.`,
  japanese: { id: position, contributor: null, license: 'CC BY 2.0 FR' },
  english: { id: 1_000 + position, contributor: null, license: 'CC BY 2.0 FR' }
})

const shown = () =>
  [...container.querySelectorAll('[data-example]')].map(row =>
    Number(row.getAttribute('data-example'))
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
    const initial = Array.from({ length: 25 }, (_, index) => example(index))
    act(() => root.render(<ExampleList initial={initial} listed={30} path="/e.json?build=b" />))
    const button = [...container.querySelectorAll('button')].find(
      candidate => candidate.textContent === 'Load more examples'
    )
    if (!button || !scrollListIntoView) throw new Error('No Load more button or observer')
    const scroll = scrollListIntoView
    await act(async () => {
      button.click()
      scroll()
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('/e.json?build=b&from=25')
    await act(async () => {
      answer(Response.json({ examples: [25, 26, 27, 28, 29].map(example) }))
    })
    expect(shown()).toEqual(Array.from({ length: 30 }, (_, index) => index))
    expect(container.textContent).not.toContain('Load more examples')
  })
})
