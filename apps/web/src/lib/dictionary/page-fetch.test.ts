import { describe, expect, test, vi } from 'vitest'
import type { PageExample } from './page-example'
import { fetchExamplePage, fetchFormExamples } from './page-fetch'

const example: PageExample = {
  position: 25,
  pairId: '19',
  text: '見る。',
  tokens: [],
  translation: 'Example 25.'
}

const answering = (response: Response) => async () => response

describe('fetchExamplePage', () => {
  test('reads the next page of examples', async () => {
    const fetcher = vi.fn(async (_url: string) => Response.json({ examples: [example] }))
    expect(await fetchExamplePage('/x.json?build=b&from=25', fetcher)).toEqual({
      kind: 'items',
      items: [example]
    })
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/x.json?build=b&from=25')
  })

  test('offers a reload when the route no longer knows the build, and a retry on failure', async () => {
    expect(await fetchExamplePage('/x', answering(new Response(null, { status: 404 })))).toEqual({
      kind: 'stale'
    })
    expect(await fetchExamplePage('/x', answering(Response.json({ examples: [] })))).toEqual({
      kind: 'stale'
    })
    expect(await fetchExamplePage('/x', answering(new Response(null, { status: 500 })))).toEqual({
      kind: 'failed'
    })
  })
})

describe('fetchFormExamples', () => {
  test("asks for the form's own examples, and fails on an error answer", async () => {
    const fetcher = vi.fn(async (_url: string) => Response.json({ examples: [example] }))
    expect(await fetchFormExamples('見ます', fetcher)).toEqual([example])
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      `/dictionary/conjugations/${encodeURIComponent('見ます')}.json`
    )
    await expect(
      fetchFormExamples('見ます', answering(new Response(null, { status: 500 })))
    ).rejects.toThrow('500')
  })
})
