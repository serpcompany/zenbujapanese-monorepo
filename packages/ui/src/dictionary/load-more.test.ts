import { describe, expect, test, vi } from 'vitest'
import { type LoadedPage, loadNextPage } from './load-more'

describe('loadNextPage', () => {
  test('a click and the observer at once load the next page once', async () => {
    let answer: (page: LoadedPage<number>) => void = () => {}
    const loadMore = vi.fn(
      (_from: number) =>
        new Promise<LoadedPage<number>>(resolve => {
          answer = resolve
        })
    )
    const inFlight = { current: false }
    const click = loadNextPage(inFlight, 25, loadMore)
    const observer = loadNextPage(inFlight, 25, loadMore)
    answer({ kind: 'items', items: [25, 26] })
    expect(await click).toEqual({ kind: 'items', items: [25, 26] })
    expect(await observer).toEqual({ kind: 'busy' })
    expect(loadMore).toHaveBeenCalledExactlyOnceWith(25)
    expect(inFlight.current).toBe(false)
  })

  test('passes on a stale or failed page, and offers a retry when loading throws', async () => {
    const inFlight = { current: false }
    expect(await loadNextPage(inFlight, 25, async () => ({ kind: 'stale' }))).toEqual({
      kind: 'stale'
    })
    expect(await loadNextPage(inFlight, 25, async () => ({ kind: 'failed' }))).toEqual({
      kind: 'failed'
    })
    expect(
      await loadNextPage(inFlight, 25, async () => {
        throw new Error('offline')
      })
    ).toEqual({ kind: 'failed' })
    expect(inFlight.current).toBe(false)
  })
})
