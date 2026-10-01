import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { formExample } from '@zenbu/dictionary-core/detail/examples'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, dictionary } from './support'

describe.runIf(artifactAvailable)("a conjugated form's examples", () => {
  let service: Dictionary

  beforeAll(async () => {
    service = await dictionary({ morphology: false })
  })

  test.each([
    '食べた',
    '見られる',
    '行きます'
  ])('each of 「%s」 uses the whole form as one word, accented', form => {
    const { rows, listed } = service.formExamples(form, 0, 100)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBe(listed)
    expect(listed).toBeLessThanOrEqual(100)
    for (const example of rows.map(formExample)) {
      expect(example.text).toContain(form)
      const accented = example.tokens.filter(token => token.isPageWord).map(token => token.text)
      expect(accented, example.text).toContain(form)
    }
  })

  test('pages them from a position, with how many the form lists', () => {
    const all = service.formExamples('食べた', 0, 100)
    const page = service.formExamples('食べた', 25, 25)
    expect(page.listed).toBe(all.listed)
    expect(page.rows.map(row => row.example.position)).toEqual(
      all.rows.slice(25, 50).map(row => row.example.position)
    )
    expect(page.rows[0]?.example.position).toBe(25)
  })

  test('a form inside a longer word Kuromoji keeps whole, as 食べた in 食べたい, is not its example', () => {
    const texts = service
      .formExamples('食べた', 0, 100)
      .rows.map(({ sentence }) => sentence.japanese)
    const inside = service
      .formExamples('食べたい', 0, 100)
      .rows.map(({ sentence }) => sentence.japanese)
      .filter(text => !text.replaceAll('食べたい', '').includes('食べた'))
    expect(inside.length).toBeGreaterThan(0)
    expect(inside.filter(text => texts.includes(text))).toEqual([])
  })

  test('a form no sentence uses has none', () => {
    expect(service.formExamples('食べさせられなかった', 0, 100)).toMatchObject({
      rows: [],
      listed: 0
    })
  })
})
