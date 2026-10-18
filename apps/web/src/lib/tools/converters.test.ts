import { describe, expect, test } from 'vitest'
import { bothSides, convert, defaultConverterOptions } from './convert'
import { converterFor, converters, toolPages } from './converters'
import { converterSlugs } from './paths'

describe('the converters', () => {
  test('are the six directions, each at /tools/<name>/ and titled from and to', () => {
    expect(converters.map(converter => [converter.path, converter.name])).toEqual([
      ['/tools/hiragana-to-katakana/', 'Hiragana to Katakana'],
      ['/tools/katakana-to-hiragana/', 'Katakana to Hiragana'],
      ['/tools/romaji-to-kana/', 'Romaji to Kana'],
      ['/tools/kana-to-romaji/', 'Kana to Romaji'],
      ['/tools/half-width-to-full-width/', 'Half-width to Full-width'],
      ['/tools/full-width-to-half-width/', 'Full-width to Half-width']
    ])
    expect(converters.map(converter => converter.slug)).toEqual([...converterSlugs])
  })

  test('each one’s other direction is the converter the other way round', () => {
    for (const converter of converters) {
      const other = converterFor(converter.reverse)
      expect(other.reverse).toBe(converter.slug)
      expect(other.pair).toBe(converter.pair)
      expect(other.from).toBe(converter.to)
    }
  })

  test('each one relates three others, leaving out itself and its other direction, which it links on its own', () => {
    for (const converter of converters) {
      expect(converter.related).toHaveLength(3)
      expect(converter.related).not.toContain(converter.slug)
      expect(converter.related).not.toContain(converter.reverse)
      expect(new Set(converter.related).size).toBe(3)
    }
  })

  test('the tools pages are the index and the six converters, each with its own title and description', () => {
    expect(toolPages.map(page => page.path)).toEqual([
      '/tools/',
      ...converters.map(converter => converter.path)
    ])
    expect(new Set(toolPages.map(page => page.title)).size).toBe(toolPages.length)
    expect(new Set(toolPages.map(page => page.description)).size).toBe(toolPages.length)
  })
})

describe('converting', () => {
  test.each([
    ['hiragana-to-katakana', 'こーひー', 'コーヒー'],
    ['katakana-to-hiragana', 'カタカナ', 'かたかな'],
    ['romaji-to-kana', 'arigatou', 'ありがとう'],
    ['kana-to-romaji', 'すし', 'sushi'],
    ['half-width-to-full-width', 'ｶﾀｶﾅ', 'カタカナ'],
    ['full-width-to-half-width', 'ＡＢＣ', 'ABC']
  ] as const)('%s turns its card’s sample %s into %s', (slug, sample, result) => {
    expect(converterFor(slug).card.sample).toBe(sample)
    expect(convert(slug, sample)).toBe(result)
  })

  test('reads text in its composed form, as typed or pasted from anywhere', () => {
    const decomposed = 'カ\u3099ッコウ'
    expect(convert('kana-to-romaji', decomposed)).toBe('gakkou')
    expect(convert('full-width-to-half-width', decomposed)).toBe('ｶﾞｯｺｳ')
    expect(convert('romaji-to-kana', 'To\u0304kyo\u0304')).toBe('とうきょう')
  })

  test('typing in either box fills the other, and keeps what was typed as it is', () => {
    const options = defaultConverterOptions
    expect(bothSides('hiragana-to-katakana', { side: 'from', text: 'すし' }, options)).toEqual({
      from: 'すし',
      to: 'スシ'
    })
    expect(bothSides('hiragana-to-katakana', { side: 'to', text: 'ラーメン' }, options)).toEqual({
      from: 'らーめん',
      to: 'ラーメン'
    })
    expect(bothSides('romaji-to-kana', { side: 'to', text: 'きって' }, options)).toEqual({
      from: 'kitte',
      to: 'きって'
    })
    expect(bothSides('kana-to-romaji', { side: 'to', text: 'Kitte' }, options)).toEqual({
      from: 'きって',
      to: 'Kitte'
    })
  })

  test('the options apply in both directions', () => {
    const katakana = { ...defaultConverterOptions, script: 'katakana' } as const
    expect(bothSides('romaji-to-kana', { side: 'from', text: 'ko-hi-' }, katakana).to).toBe(
      'コーヒー'
    )
    const lettersOnly = {
      ...defaultConverterOptions,
      widths: { katakana: false, lettersAndNumbers: true, symbolsAndSpaces: false }
    }
    expect(
      bothSides('half-width-to-full-width', { side: 'to', text: 'ＡＢＣ　カナ' }, lettersOnly).from
    ).toBe('ABC　カナ')
  })

  test('romaji to kana writes the script chosen', () => {
    expect(
      convert('romaji-to-kana', 'ko-hi-', { ...defaultConverterOptions, script: 'katakana' })
    ).toBe('コーヒー')
  })

  test('the width converters change only what is chosen', () => {
    const widths = { katakana: true, lettersAndNumbers: false, symbolsAndSpaces: false }
    expect(
      convert('half-width-to-full-width', 'ｶﾀｶﾅ ABC', { ...defaultConverterOptions, widths })
    ).toBe('カタカナ ABC')
    expect(
      convert('full-width-to-half-width', 'カタカナ　ＡＢＣ', {
        ...defaultConverterOptions,
        widths
      })
    ).toBe('ｶﾀｶﾅ　ＡＢＣ')
  })
})
