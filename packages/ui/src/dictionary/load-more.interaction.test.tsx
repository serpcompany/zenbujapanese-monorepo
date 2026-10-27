import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ExampleList, type ExampleListText, type ShownExample } from './example-list'
import type { LoadedPage } from './load-more'

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

const example = (position: number): ShownExample => ({
  position,
  pairId: position.toString(16),
  text: '見る。',
  tokens: [],
  translation: `Example ${position}.`
})

const text: ExampleListText = {
  lang: 'en',
  examples: {
    more: 'More',
    loading: 'Loading',
    stale: 'Updated',
    reload: 'Reload',
    retry: 'Retry',
    pronounce: 'Pronounce',
    possibleEntries: '{count} entries',
    romajiUnavailable: 'No romaji'
  },
  pronounce: { unsupported: 'Unsupported' }
}

const shown = () =>
  [...container.querySelectorAll('[data-example]')].map(row =>
    Number(row.getAttribute('data-example'))
  )

const buttonSaying = (label: string) =>
  [...container.querySelectorAll('button')].find(button => button.textContent === label)

function renderList(loadMore: (from: number) => Promise<LoadedPage<ShownExample>>) {
  const onReload = vi.fn()
  const initial = Array.from({ length: 25 }, (_, index) => example(index))
  act(() =>
    root.render(
      <ExampleList
        initial={initial}
        paging={{ listed: 30, loadMore, onReload }}
        text={text}
        renderWordLink={() => null}
        onUnsupported={() => {}}
      />
    )
  )
  return onReload
}

describe('a paged list', () => {
  test('a click and scrolling into view at once load the next page once', async () => {
    let answer: (page: LoadedPage<ShownExample>) => void = () => {}
    const loadMore = vi.fn(
      (_from: number) =>
        new Promise<LoadedPage<ShownExample>>(resolve => {
          answer = resolve
        })
    )
    renderList(loadMore)
    const button = buttonSaying('More')
    if (!button || !scrollListIntoView) throw new Error('No More button or observer')
    const scroll = scrollListIntoView
    await act(async () => {
      button.click()
      scroll()
    })
    expect(loadMore).toHaveBeenCalledExactlyOnceWith(25)
    await act(async () => answer({ kind: 'items', items: [25, 26, 27, 28, 29].map(example) }))
    expect(shown()).toEqual(Array.from({ length: 30 }, (_, index) => index))
    expect(buttonSaying('More')).toBeUndefined()
  })

  test('a stale page says the examples were updated, and its button reloads', async () => {
    const onReload = renderList(async () => ({ kind: 'stale' }))
    await act(async () => buttonSaying('More')?.click())
    expect(container.textContent).toContain('Updated')
    expect(shown()).toHaveLength(25)
    expect(onReload).not.toHaveBeenCalled()
    act(() => buttonSaying('Reload')?.click())
    expect(onReload).toHaveBeenCalledOnce()
  })

  test('a failed page offers a retry and keeps the rows it has', async () => {
    renderList(async () => ({ kind: 'failed' }))
    await act(async () => buttonSaying('More')?.click())
    expect(buttonSaying('Retry')).toBeTruthy()
    expect(shown()).toHaveLength(25)
  })
})
