import { afterEach, describe, expect, test, vi } from 'vitest'
import { keptAnswers } from '@/test/edge-cache'
import {
  cachedPage,
  isCachedPageRequest,
  isWholePage,
  pageCacheHeader,
  pageFreshSeconds,
  pageStaleSeconds
} from './page-cache'

const wordPage = 'https://zenbujapanese.com/dictionary/%E7%89%A2%E5%B1%8B-1560930/'
const nextDynamicCacheControl = 'private, no-cache, no-store, max-age=0, must-revalidate'

function renderedPage(body = '<!DOCTYPE html><h1>牢屋</h1>', init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    ...init,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': nextDynamicCacheControl,
      ...init.headers
    }
  })
}

function site(version = 'version-1') {
  const waiting: Promise<unknown>[] = []
  let clock = Date.parse('2026-10-19T12:00:00Z')
  const render = vi.fn(async () => renderedPage(`<!DOCTYPE html><p>rendered at ${clock}</p>`))
  const context = {
    version,
    waitUntil: (promise: Promise<unknown>) => {
      waiting.push(promise)
    },
    now: () => clock
  }
  const get = async (url = wordPage, init: RequestInit = {}) => {
    const response = await cachedPage(new Request(url, init), new URL(url), context, render)
    await Promise.all(waiting.splice(0))
    return response
  }
  const wait = (seconds: number) => {
    clock += seconds * 1000
  }
  return { get, render, wait, context }
}

describe('the page cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('renders a page once, then answers the next request from the edge', async () => {
    keptAnswers()
    const { get, render } = site()
    const first = await get()
    expect(first.headers.get(pageCacheHeader)).toBe('MISS')
    const firstBody = await first.text()
    const second = await get()
    expect(second.headers.get(pageCacheHeader)).toBe('HIT')
    expect(await second.text()).toBe(firstBody)
    expect(render).toHaveBeenCalledTimes(1)
  })

  test('sends the browser the Cache-Control the page was rendered with, and no internal header', async () => {
    keptAnswers()
    const { get } = site()
    for (const response of [await get(), await get()]) {
      expect(response.headers.get('Cache-Control')).toBe(nextDynamicCacheControl)
      expect([...response.headers.keys()].filter(name => name.startsWith('x-page-cache-'))).toEqual(
        []
      )
    }
  })

  test.each([
    [
      'fell back to rendering in the browser',
      '<html id="__next_error__"><head></head><body></body>'
    ],
    ['lost a part to an error', '<main><template data-dgst="3141592653"></template></main>']
  ])("doesn't keep a page whose server render %s, so the next request renders it again", async (_, html) => {
    const kept = keptAnswers()
    const { context } = site()
    const answered = await cachedPage(new Request(wordPage), new URL(wordPage), context, async () =>
      renderedPage(html)
    )
    expect(await answered.text()).toBe(html)
    expect(kept.size).toBe(0)
  })

  test('keeps a page with a part Next.js renders only in the browser by design', () => {
    expect(
      isWholePage('<main><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template></main>')
    ).toBe(true)
  })

  test('keeps a page for its fresh time and the stale time after it', async () => {
    const kept = keptAnswers()
    const { get } = site()
    await get()
    const [stored] = kept.values()
    expect(stored.headers.get('Cache-Control')).toBe(
      `public, max-age=${pageFreshSeconds + pageStaleSeconds}`
    )
  })

  test('answers a page past its fresh time at once, and renders it again for the next request', async () => {
    keptAnswers()
    const { get, render, wait } = site()
    const first = await (await get()).text()
    wait(pageFreshSeconds + 1)
    const stale = await get()
    expect(stale.headers.get(pageCacheHeader)).toBe('STALE')
    expect(await stale.text()).toBe(first)
    expect(render).toHaveBeenCalledTimes(2)
    const next = await get()
    expect(next.headers.get(pageCacheHeader)).toBe('HIT')
    expect(await next.text()).not.toBe(first)
  })

  test("doesn't read a copy another deploy kept, whose page names that deploy's scripts", async () => {
    keptAnswers()
    await site('version-1').get()
    const { get, render } = site('version-2')
    expect((await get()).headers.get(pageCacheHeader)).toBe('MISS')
    expect(render).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['a missing page', renderedPage('Not found', { status: 404 })],
    ['a failure', renderedPage('Error', { status: 500 })],
    ['a redirect', new Response(null, { status: 308, headers: { Location: '/about/' } })],
    ['JSON', Response.json({ examples: [] })],
    ['a page that sets a cookie', renderedPage(undefined, { headers: { 'Set-Cookie': 'a=b' } })]
  ])("doesn't keep %s", async (_, response) => {
    const kept = keptAnswers()
    const { context } = site()
    const answered = await cachedPage(new Request(wordPage), new URL(wordPage), context, async () =>
      response.clone()
    )
    expect(answered.status).toBe(response.status)
    expect(answered.headers.get(pageCacheHeader)).toBeNull()
    expect(kept.size).toBe(0)
  })

  test('renders the page when the edge cache fails', async () => {
    const broken = async () => {
      throw new Error('cache unavailable')
    }
    vi.stubGlobal('caches', { default: { match: broken, put: broken } })
    const { get, render } = site()
    expect((await get()).status).toBe(200)
    expect(render).toHaveBeenCalledTimes(1)
  })

  test('renders every request where there is no edge cache, as in local development', async () => {
    const { get, render } = site()
    await get()
    await get()
    expect(render).toHaveBeenCalledTimes(2)
  })
})

describe('which requests the page cache answers', () => {
  const asked = (url: string, init: RequestInit = {}) =>
    isCachedPageRequest(new Request(url, init), new URL(url))

  test.each([
    ['a word page', wordPage],
    ['a Japanese word page', 'https://zenbujapanese.com/ja/dictionary/x-1/'],
    ['a search page', 'https://zenbujapanese.com/dictionary/search/cat/'],
    ['a browse page', 'https://zenbujapanese.com/dictionary/browse/nouns/950/'],
    ['the homepage', 'https://zenbujapanese.com/']
  ])('answers %s', (_, url) => {
    expect(asked(url)).toBe(true)
  })

  test.each([
    ['a sign-in page', 'https://zenbujapanese.com/login/'],
    ['the account page in Japanese', 'https://zenbujapanese.com/ja/account/'],
    ['a file', 'https://zenbujapanese.com/sitemap-index.xml'],
    ['a list that loads more', 'https://zenbujapanese.com/dictionary/examples/1.json?from=25'],
    ['a navigation inside the site', `${wordPage}?_rsc=abc`]
  ])('leaves %s to the page itself', (_, url) => {
    expect(asked(url)).toBe(false)
  })

  test.each([
    ['rsc'],
    ['next-router-prefetch'],
    ['next-router-state-tree']
  ])('leaves a request with the %s header to Next.js, which answers it with data, not HTML', header => {
    expect(asked(wordPage, { headers: { [header]: '1' } })).toBe(false)
  })

  test.each([['HEAD'], ['POST']])('leaves a %s request to the page', method => {
    expect(asked(wordPage, { method })).toBe(false)
  })
})
