import { maximumQueryLength } from '@zenbu/dictionary-core/artifact/dictionary'
import { segmentationFurigana } from '@zenbu/dictionary-core/cards/segmentation'
import { fixtureSegmentation } from '@zenbu/dictionary-core/fixtures'
import { describe, expect, test } from 'vitest'
import { getDictionary } from '@/lib/i18n/dictionary'
import { furiganaHtml, furiganaPlainText, furiganaReadingsUrl, furiganaTool } from './furigana-tool'
import { furiganaPageIn, questionsIn } from './tool-pages'

const furiganaOf = (text: string) => {
  const tokens = fixtureSegmentation.get(text)
  if (!tokens) throw new Error(`The fixtures hold no segmentation of ${text}`)
  return segmentationFurigana(tokens)
}

describe('Kanji to Furigana', () => {
  test('its sample and its card’s sample show the furigana the dictionary gives them', () => {
    for (const sample of [furiganaTool.sample, furiganaTool.card.sample]) {
      expect(sample.furigana).toEqual(furiganaOf(sample.text))
    }
    expect(furiganaTool.card.sample.furigana).toEqual([{ text: '今日', reading: 'きょう' }])
  })

  test('every Try example is a text the fixtures read, so it converts without a service', () => {
    for (const example of furiganaTool.tries) expect(furiganaOf(example).length).toBeGreaterThan(0)
  })

  test('reads words in context: 今日 きょう, 大人 おとな, 一人 ひとり, 二人 ふたり, 日本 にほん, never kanji by kanji', () => {
    const read = new Map(
      furiganaTool.sample.furigana.flatMap(({ text, reading }) =>
        reading ? [[text, reading] as const] : []
      )
    )
    expect(['今日', '大人', '一人', '二人', '日本'].map(word => read.get(word))).toEqual([
      'きょう',
      'おとな',
      'ひとり',
      'ふたり',
      'にほん'
    ])
  })

  test('copies as ruby, escaped, with a line break kept, and as plain text with each reading in brackets', () => {
    const furigana = [{ text: '食', reading: 'た' }, { text: 'べる\n' }, { text: '<b>&' }]
    expect(furiganaHtml(furigana)).toBe(
      '<ruby>食<rp>（</rp><rt>た</rt><rp>）</rp></ruby>べる<br>&lt;b&gt;&amp;'
    )
    expect(furiganaPlainText(furigana)).toBe('食（た）べる\n<b>&')
  })

  test('asks for a text’s readings at the site’s own route, the text encoded', () => {
    expect(furiganaReadingsUrl('今日/明日')).toBe(
      `/tools/furigana.json?text=${encodeURIComponent('今日/明日')}`
    )
  })

  test.each(['en', 'ja'] as const)('in %s, it states the dictionary service’s limit', locale => {
    const limit = String(maximumQueryLength)
    const [, howMuch] = questionsIn('furigana', locale)
    expect(howMuch.answer).toContain(limit)
    expect(furiganaPageIn(locale).description).toContain(limit)
    expect(getDictionary(locale).tools.furigana.tooLong).toContain('{limit}')
  })
})
