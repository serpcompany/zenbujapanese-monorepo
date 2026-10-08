import type { SitePage } from '@/lib/pages'
import { type ConverterSlug, converterPath, toolsPath } from './paths'

export type ConverterPair = 'kana' | 'romaji' | 'width'
export type Writing = 'japanese' | 'romaji'

export const languageOf: Record<Writing, string> = { japanese: 'ja', romaji: 'ja-Latn' }
export type ConverterSetting = 'script' | 'widths'

export interface Converter extends SitePage {
  slug: ConverterSlug
  name: string
  pair: ConverterPair
  from: string
  to: string
  reverse: ConverterSlug
  lead: string
  card: { line: string; mark: string; sample: string }
  sample: string
  tries: readonly string[]
  input: Writing
  output: Writing
  setting?: ConverterSetting
  related: readonly ConverterSlug[]
}

type ConverterContent = Omit<Converter, 'path' | 'name' | 'title'>

function converter(content: ConverterContent): Converter {
  const name = `${content.from} to ${content.to}`
  return { ...content, name, title: `${name} Converter`, path: converterPath(content.slug) }
}

export const converters: readonly Converter[] = [
  converter({
    slug: 'hiragana-to-katakana',
    pair: 'kana',
    from: 'Hiragana',
    to: 'Katakana',
    reverse: 'katakana-to-hiragana',
    description:
      'Convert hiragana to katakana as you type, free in your browser. Kanji, letters, and punctuation stay as they are.',
    lead: 'Type or paste hiragana and get katakana as you type. Kanji, letters, and punctuation stay as they are.',
    card: { line: 'Turn hiragana into katakana as you type.', mark: 'ア', sample: 'こーひー' },
    sample: 'こんぴゅーたー、すまーとふぉん、こーひー、あいすくりーむ',
    tries: ['こーひー', 'すまほ', 'ぱーてぃー'],
    input: 'japanese',
    output: 'japanese',
    related: ['katakana-to-hiragana', 'romaji-to-kana', 'half-width-to-full-width']
  }),
  converter({
    slug: 'katakana-to-hiragana',
    pair: 'kana',
    from: 'Katakana',
    to: 'Hiragana',
    reverse: 'hiragana-to-katakana',
    description:
      'Convert katakana to hiragana as you type, free in your browser. Kanji, letters, and punctuation stay as they are.',
    lead: 'Type or paste katakana and get hiragana as you type. Kanji, letters, and punctuation stay as they are.',
    card: { line: 'Turn katakana back into hiragana.', mark: 'あ', sample: 'カタカナ' },
    sample: 'コンピューター、スマートフォン、コーヒー、アイスクリーム',
    tries: ['トウキョウ', 'アリガトウ', 'ラーメン'],
    input: 'japanese',
    output: 'japanese',
    related: ['hiragana-to-katakana', 'kana-to-romaji', 'full-width-to-half-width']
  }),
  converter({
    slug: 'romaji-to-kana',
    pair: 'romaji',
    from: 'Romaji',
    to: 'Kana',
    reverse: 'kana-to-romaji',
    description:
      'Type Japanese in romaji on any keyboard and get hiragana or katakana as you type, free in your browser.',
    lead: 'Type Japanese in Latin letters on any keyboard and get hiragana or katakana as you type.',
    card: {
      line: 'Type romaji on any keyboard and get hiragana or katakana.',
      mark: 'か',
      sample: 'arigatou'
    },
    sample: 'arigatou. ko-hi- to matcha wo kudasai.',
    tries: ['arigatou', 'kitte', 'ko-hi-', 'shinbun'],
    input: 'romaji',
    output: 'japanese',
    setting: 'script',
    related: ['kana-to-romaji', 'hiragana-to-katakana', 'half-width-to-full-width']
  }),
  converter({
    slug: 'kana-to-romaji',
    pair: 'romaji',
    from: 'Kana',
    to: 'Romaji',
    reverse: 'romaji-to-kana',
    description:
      'Convert hiragana and katakana to romaji, spelled the Hepburn way, free in your browser.',
    lead: 'Paste hiragana or katakana and read it in Latin letters, spelled the Hepburn way, as on signs and in most textbooks.',
    card: {
      line: 'Read kana in Latin letters, in Hepburn romanization.',
      mark: 'Ro',
      sample: 'すし'
    },
    sample: 'きって コーヒー とうきょう きんえん',
    tries: ['きって', 'きんえん', 'コーヒー', 'とうきょう'],
    input: 'japanese',
    output: 'romaji',
    related: ['romaji-to-kana', 'katakana-to-hiragana', 'full-width-to-half-width']
  }),
  converter({
    slug: 'half-width-to-full-width',
    pair: 'width',
    from: 'Half-width',
    to: 'Full-width',
    reverse: 'full-width-to-half-width',
    description:
      'Convert half-width katakana, letters, and numbers to full-width, as many Japanese forms ask, free in your browser.',
    lead: 'Turn half-width katakana, letters, and numbers into full-width, as many Japanese forms ask for.',
    card: {
      line: 'Fix half-width katakana and letters for Japanese forms.',
      mark: 'Ａ',
      sample: 'ｶﾀｶﾅ'
    },
    sample: 'ﾔﾏﾀﾞ ﾀﾛｳ ｻﾏ｡ ABC-123',
    tries: ['ﾊﾟﾝ', 'ｶﾞｯｺｳ', 'Tokyo 2026'],
    input: 'japanese',
    output: 'japanese',
    setting: 'widths',
    related: ['full-width-to-half-width', 'hiragana-to-katakana', 'romaji-to-kana']
  }),
  converter({
    slug: 'full-width-to-half-width',
    pair: 'width',
    from: 'Full-width',
    to: 'Half-width',
    reverse: 'half-width-to-full-width',
    description:
      'Convert full-width katakana, letters, and numbers to half-width, for systems that only take narrow characters, free in your browser.',
    lead: 'Turn full-width katakana, letters, and numbers into half-width, for systems that only take narrow characters.',
    card: {
      line: 'Shrink full-width katakana, letters, and numbers.',
      mark: 'A',
      sample: 'ＡＢＣ'
    },
    sample: 'ヤマダ　タロウ　サマ。ＡＢＣ－１２３',
    tries: ['パン', 'ガッコウ', 'Ｔｏｋｙｏ　２０２６'],
    input: 'japanese',
    output: 'japanese',
    setting: 'widths',
    related: ['half-width-to-full-width', 'katakana-to-hiragana', 'kana-to-romaji']
  })
]

export function converterFor(slug: ConverterSlug): Converter {
  const found = converters.find(candidate => candidate.slug === slug)
  if (!found) throw new Error(`Unknown converter: ${slug}`)
  return found
}

export const toolsIndex = {
  path: toolsPath,
  title: 'Free Japanese converters and tools',
  description:
    'Convert between hiragana, katakana, and romaji, fix half-width text, and browse kana and kanji charts. Free, in your browser.'
} as const satisfies SitePage

export const toolPages: readonly SitePage[] = [toolsIndex, ...converters]
