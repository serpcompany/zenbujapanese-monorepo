import { test as base, expect, type Page } from '@playwright/test'
import { wordSlug } from '@zenbu/dictionary-core/detail/slug'
import { fixtureSearchOrder, fixtureWordRows } from '@zenbu/dictionary-core/fixtures'

export { expect }

export const onProductionBuild = process.env.E2E_SERVER === 'preview'

export const test = base.extend<{ allowedConsoleErrors: RegExp[]; consoleErrors: string[] }>({
  allowedConsoleErrors: [[], { option: true }],
  consoleErrors: [
    async ({ page, allowedConsoleErrors }, use) => {
      const errors: string[] = []
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text())
      })
      page.on('pageerror', error => errors.push(`${error.name}: ${error.message}`))
      await use(errors)
      const unexpected = errors.filter(
        error => !allowedConsoleErrors.some(pattern => pattern.test(error))
      )
      expect(
        unexpected,
        'The page logged errors. A hydration error (React #418 or #423) means the server HTML differs from the first render in the browser.'
      ).toEqual([])
    },
    { auto: true }
  ]
})

const words = new Map(fixtureWordRows.map(rows => [rows.entry.entSeq, rows.entry]))

export function word(entSeq: number) {
  const entry = words.get(entSeq)
  if (!entry) throw new Error(`The fixtures have no word ${entSeq}`)
  return {
    headword: entry.headword,
    reading: entry.reading,
    path: encodeURI(`/dictionary/${wordSlug(entry.headword, entry.reading)}-${entSeq}/`)
  }
}

export const searchOrder = (query: string) =>
  (fixtureSearchOrder[query] ?? []).map(entSeq => word(entSeq))

export const needed = word(1546640)

export const sidewaysOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
