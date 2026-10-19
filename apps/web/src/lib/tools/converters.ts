import type { ConverterSlug } from './paths'

export type ConverterPair = 'kana' | 'romaji' | 'width'
export type Writing = 'japanese' | 'romaji'

export const languageOf: Record<Writing, string> = { japanese: 'ja', romaji: 'ja-Latn' }
type ConverterSetting = 'script' | 'widths'

export interface Converter {
  slug: ConverterSlug
  pair: ConverterPair
  reverse: ConverterSlug
  card: { mark: string; sample: string }
  sample: string
  tries: readonly string[]
  input: Writing
  output: Writing
  setting?: ConverterSetting
  related: readonly ConverterSlug[]
}

export const converters: readonly Converter[] = [
  {
    slug: 'hiragana-to-katakana',
    pair: 'kana',
    reverse: 'katakana-to-hiragana',
    card: { mark: 'ア', sample: 'こーひー' },
    sample: 'こんぴゅーたー、すまーとふぉん、こーひー、あいすくりーむ',
    tries: ['こーひー', 'すまほ', 'ぱーてぃー'],
    input: 'japanese',
    output: 'japanese',
    related: ['romaji-to-kana', 'kana-to-romaji', 'half-width-to-full-width']
  },
  {
    slug: 'katakana-to-hiragana',
    pair: 'kana',
    reverse: 'hiragana-to-katakana',
    card: { mark: 'あ', sample: 'カタカナ' },
    sample: 'コンピューター、スマートフォン、コーヒー、アイスクリーム',
    tries: ['トウキョウ', 'アリガトウ', 'ラーメン'],
    input: 'japanese',
    output: 'japanese',
    related: ['kana-to-romaji', 'romaji-to-kana', 'full-width-to-half-width']
  },
  {
    slug: 'romaji-to-kana',
    pair: 'romaji',
    reverse: 'kana-to-romaji',
    card: { mark: 'か', sample: 'arigatou' },
    sample: 'arigatou. ko-hi- to matcha wo kudasai.',
    tries: ['arigatou', 'kitte', 'ko-hi-', 'shinbun'],
    input: 'romaji',
    output: 'japanese',
    setting: 'script',
    related: ['hiragana-to-katakana', 'katakana-to-hiragana', 'half-width-to-full-width']
  },
  {
    slug: 'kana-to-romaji',
    pair: 'romaji',
    reverse: 'romaji-to-kana',
    card: { mark: 'Ro', sample: 'すし' },
    sample: 'きって コーヒー とうきょう きんえん',
    tries: ['きって', 'きんえん', 'コーヒー', 'とうきょう'],
    input: 'japanese',
    output: 'romaji',
    related: ['katakana-to-hiragana', 'hiragana-to-katakana', 'full-width-to-half-width']
  },
  {
    slug: 'half-width-to-full-width',
    pair: 'width',
    reverse: 'full-width-to-half-width',
    card: { mark: 'Ａ', sample: 'ｶﾀｶﾅ' },
    sample: 'ﾔﾏﾀﾞ ﾀﾛｳ ｻﾏ｡ ABC-123',
    tries: ['ﾊﾟﾝ', 'ｶﾞｯｺｳ', 'Tokyo 2026'],
    input: 'japanese',
    output: 'japanese',
    setting: 'widths',
    related: ['hiragana-to-katakana', 'katakana-to-hiragana', 'romaji-to-kana']
  },
  {
    slug: 'full-width-to-half-width',
    pair: 'width',
    reverse: 'half-width-to-full-width',
    card: { mark: 'ｶﾅ', sample: 'ＡＢＣ' },
    sample: 'ヤマダ　タロウ　サマ。ＡＢＣ－１２３',
    tries: ['パン', 'ガッコウ', 'Ｔｏｋｙｏ　２０２６'],
    input: 'japanese',
    output: 'japanese',
    setting: 'widths',
    related: ['katakana-to-hiragana', 'hiragana-to-katakana', 'kana-to-romaji']
  }
]

export function converterFor(slug: ConverterSlug): Converter {
  const found = converters.find(candidate => candidate.slug === slug)
  if (!found) throw new Error(`Unknown converter: ${slug}`)
  return found
}
