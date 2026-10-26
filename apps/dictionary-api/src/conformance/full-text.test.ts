import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, artifactDatabase, dictionary } from './support'

describe.runIf(artifactAvailable)('full-text search as the app runs it', () => {
  let service: Dictionary

  beforeAll(async () => {
    service = await dictionary({ morphology: false })
  })

  test('a long number finds glosses, as FTS4 stems it', async () => {
    const { screen } = await service.search('9999999')
    expect(screen.state).toBe('results')
    if (screen.state !== 'results') return
    expect(screen.rows.map(row => row.headword)).toEqual(
      expect.arrayContaining(['テンナイン', 'イレブンナイン'])
    )
  })

  test('a stray double quote finds nothing, rather than failing', async () => {
    const { screen } = await service.search('eat"')
    expect(screen.state).toBe('noResults')
    expect(await service.searchExamples('eat"')).toBeNull()
  })

  test('a query in other Latin letters than romaji’s searches English alone, since no stored form has such a letter', async () => {
    const forms = (await artifactDatabase()).all<{ form: string }>('SELECT form FROM forms')
    expect(forms.length).toBeGreaterThan(700_000)
    const otherLatin = (form: string) =>
      [...form].some(letter => letter > '\x7f' && /\p{Script=Latin}/u.test(letter))
    expect(forms.filter(({ form }) => otherLatin(form))).toEqual([])
    const { screen } = await service.search('Café')
    expect(screen.state === 'results' && screen.rows[0]?.headword).toBe('カフェ')
  })
})
