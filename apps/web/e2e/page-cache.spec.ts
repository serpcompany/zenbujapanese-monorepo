import { expect, needed, onProductionBuild, test } from './test'

const keptByWorker = 'worker.ts keeps pages at the edge, and next dev runs Next.js alone'

test.describe('The page cache', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A header is the same at every width')
    test.skip(!onProductionBuild, keptByWorker)
  })

  test('a word page asked for again comes from the edge, as the browser was first sent it', async ({
    request
  }) => {
    const first = await request.get(needed.path)
    expect(first.status()).toBe(200)
    expect(['MISS', 'HIT']).toContain(first.headers()['x-page-cache'])
    const body = await first.text()
    await expect
      .poll(async () => (await request.get(needed.path)).headers()['x-page-cache'])
      .toBe('HIT')
    const again = await request.get(needed.path)
    expect(await again.text()).toBe(body)
    expect(again.headers()['cache-control']).toBe(first.headers()['cache-control'])
  })

  test('a page asked for with a query string is rendered, never kept', async ({ request }) => {
    for (const _ of [1, 2]) {
      const response = await request.get(`${needed.path}?utm_source=test`)
      expect(response.status()).toBe(200)
      expect(response.headers()['x-page-cache']).toBeUndefined()
    }
  })

  test('an account page is never kept', async ({ request }) => {
    for (const _ of [1, 2]) {
      const response = await request.get('/login/')
      expect(response.headers()['x-page-cache']).toBeUndefined()
    }
  })

  test('a navigation inside the site is left to Next.js', async ({ request }) => {
    const response = await request.get(needed.path, { headers: { rsc: '1' } })
    expect(response.headers()['x-page-cache']).toBeUndefined()
  })
})
