import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const browseFolder = fileURLToPath(new URL('.', import.meta.url))

function pagesWithoutParameters(folder = browseFolder): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) {
      return entry.name.startsWith('[') ? [] : pagesWithoutParameters(join(folder, entry.name))
    }
    return entry.name === 'page.tsx' ? [join(folder, entry.name)] : []
  })
}

test('every browse page without route parameters reads the dictionary when it is asked for', () => {
  const pages = pagesWithoutParameters()
  expect(pages.length).toBeGreaterThan(5)
  for (const page of pages) {
    expect(
      readFileSync(page, 'utf8'),
      `${relative(browseFolder, page)} would be rendered once, at build time, where no dictionary service answers (docs/agents/web.md, Browse pages)`
    ).toContain("export const dynamic = 'force-dynamic'")
  }
})
