import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'
import type { HeaderWord } from '../test-pages/word-header.tsx'

const panelWidth = 380

const words: HeaderWord[] = [
  { headword: 'テーブル', ruby: [{ text: 'テーブル' }], reading: 'テーブル' },
  { headword: '食べる', ruby: [{ text: '食', reading: 'た' }, { text: 'べる' }], reading: 'たべる' }
]

let server: ViteDevServer

test.beforeAll(async () => {
  server = await createServer({
    configFile: fileURLToPath(new URL('../test-pages/vite.config.ts', import.meta.url)),
    logLevel: 'silent',
    server: { port: 0 }
  })
  await server.listen()
})

test.afterAll(() => server.close())

for (const word of words) {
  test(`draws ${word.headword}, read ${word.reading}, on one line at the panel's headword size in a ${panelWidth} px panel`, async ({
    page
  }) => {
    await page.setViewportSize({ width: panelWidth, height: 720 })
    const address = new URL('word-header.html', server.resolvedUrls?.local[0])
    address.searchParams.set('word', JSON.stringify(word))
    await page.goto(address.href)
    const heading = page.getByRole('heading', { level: 1, name: word.headword })
    await expect(heading).toBeVisible()
    await expect(heading.locator('.text-4xl')).toHaveCSS('font-size', '36px')
    for (const { reading } of word.ruby)
      if (reading) await expect(heading.locator(`[data-reading="${reading}"]`)).toHaveCount(1)
    const measured = await heading.evaluate(element => {
      const lines = new Set<number>()
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('rt')) continue
        const characters = node.textContent ?? ''
        for (let at = 0; at < characters.length; at++) {
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + 1)
          lines.add(Math.round(range.getBoundingClientRect().bottom))
        }
      }
      const card = element.closest('[data-slot="card"]')?.getBoundingClientRect()
      const own = element.getBoundingClientRect()
      return {
        lines: lines.size,
        overflows: element.scrollWidth > element.clientWidth,
        inside: card !== undefined && own.right <= card.right,
        pageScrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth
      }
    })
    expect(measured).toEqual({ lines: 1, overflows: false, inside: true, pageScrolls: false })
  })
}
