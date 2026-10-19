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
    const path = `${needed.path}?asked=${Date.now()}`
    const first = await request.get(path)
    expect(first.status()).toBe(200)
    expect(first.headers()['x-page-cache']).toBe('MISS')
    const body = await first.text()
    await expect.poll(async () => (await request.get(path)).headers()['x-page-cache']).toBe('HIT')
    const again = await request.get(path)
    expect(await again.text()).toBe(body)
    expect(again.headers()['cache-control']).toBe(first.headers()['cache-control'])
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
