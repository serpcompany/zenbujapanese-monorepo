import { formsWithExamples } from '@zenbu/dictionary-core/artifact/conjugation-sitemap'
import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, artifactDatabase, dictionary, readSuite, tokenizer } from './support'

// The conjugations sitemap lists a form's page only when the page lists examples. The sitemap
// works that out for every spelling in one pass (formsWithExamples); the page asks one form at a
// time (formSentences). They must agree, which this checks on every form the word-detail suite
// records, the forms with examples and those without.

interface WordCase {
  conjugations?: { plain: { surface: string }[]; polite?: { surface: string }[] }
}

const surfaces = [
  ...new Set(
    readSuite<{ cases: WordCase[] }>('word-detail').cases.flatMap(({ conjugations }) =>
      conjugations
        ? [...conjugations.plain, ...(conjugations.polite ?? [])].map(form => form.surface)
        : []
    )
  )
].sort()

describe.runIf(artifactAvailable)('the conjugations sitemap', () => {
  let service: Dictionary

  beforeAll(async () => {
    service = await dictionary({ morphology: false })
  })

  test('the suite records forms with examples and without', () => {
    expect(surfaces.length).toBeGreaterThan(100)
  })

  test('finds exactly the forms whose pages list examples', async () => {
    const found = formsWithExamples(await artifactDatabase(), surfaces, await tokenizer())
    const listing = surfaces.filter(surface => service.formSentences(surface).length > 0)
    expect(listing.length).toBeGreaterThan(0)
    expect(listing.length).toBeLessThan(surfaces.length)
    expect([...found].sort()).toEqual(listing)
  }, 600_000)
})
