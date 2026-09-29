import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { wordExample } from '@zenbu/dictionary-core/detail/examples'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, dictionary } from './support'

// A conjugated form's examples (ConjugationsView.swift's ConjugatedFormView.loadExamples): the
// sentences containing the form in which Kuromoji, with the app's inflection grouping, finds it as
// one word. The word-detail suite doesn't record them yet (recording needs the app in the
// Simulator), so these check the rule on forms whose sentences show it.

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
    const { rows } = service.conjugationExamples(form)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(100)
    for (const example of rows.map(wordExample)) {
      expect(example.text).toContain(form)
      const accented = example.tokens.filter(token => token.isPageWord).map(token => token.text)
      expect(accented, example.text).toContain(form)
    }
  })

  test('a form inside a longer word is not its example', () => {
    // 食べた occurs inside 食べたい, which Kuromoji keeps as one word.
    const texts = service
      .conjugationExamples('食べた')
      .rows.map(({ sentence }) => sentence.japanese)
    const inside = service
      .conjugationExamples('食べたい')
      .rows.map(({ sentence }) => sentence.japanese)
      .filter(text => !text.replaceAll('食べたい', '').includes('食べた'))
    expect(inside.length).toBeGreaterThan(0)
    expect(inside.filter(text => texts.includes(text))).toEqual([])
  })

  test('a form no sentence uses has none', () => {
    expect(service.conjugationExamples('食べさせられなかった').rows).toEqual([])
  })
})
