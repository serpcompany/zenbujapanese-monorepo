import { describe, expect, test, vi } from 'vitest'
import { loadNextPage } from './load-more'

// How a paged list (a word's or a search's examples, a search's words) asks for its next page:
// the Load more button and the list scrolling into view share one in-flight flag.

const read = (response: unknown) => (response as { items: number[] }).items

describe('loadNextPage', () => {
  test('a click and the observer at once fetch the next page once', async () => {
    let answer: (response: Response) => void = () => {}
    const fetcher = vi.fn(
      () =>
        new Promise<Response>(resolve => {
          answer = resolve
        })
    )
    const inFlight = { current: false }
    // The click, then the observer before the first request answers, both for position 25.
    const click = loadNextPage(inFlight, '/x.json?build=b&from=25', read, fetcher)
    const observer = loadNextPage(inFlight, '/x.json?build=b&from=25', read, fetcher)
    answer(Response.json({ items: [25, 26] }))
    expect(await click).toEqual({ kind: 'items', items: [25, 26] })
    expect(await observer).toEqual({ kind: 'busy' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    // Once it has answered, the next page may load.
    expect(inFlight.current).toBe(false)
  })

  test('offers a reload when the route no longer knows the build, and a retry on failure', async () => {
    const inFlight = { current: false }
    const answering = (response: Response) => async () => response
    expect(
      await loadNextPage(inFlight, '/x', read, answering(new Response(null, { status: 404 })))
    ).toEqual({ kind: 'stale' })
    expect(
      await loadNextPage(inFlight, '/x', read, answering(Response.json({ items: [] })))
    ).toEqual({ kind: 'stale' })
    expect(
      await loadNextPage(inFlight, '/x', read, answering(new Response(null, { status: 500 })))
    ).toEqual({ kind: 'failed' })
    expect(
      await loadNextPage(inFlight, '/x', read, async () => {
        throw new Error('offline')
      })
    ).toEqual({ kind: 'failed' })
    expect(inFlight.current).toBe(false)
  })
})
