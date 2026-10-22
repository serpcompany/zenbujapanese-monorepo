import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { type ConverterSlug, furiganaReadingsPath } from './paths'

export interface FuriganaSample {
  text: string
  furigana: RubySegment[]
}

export interface FuriganaTool {
  card: { mark: string; sample: FuriganaSample }
  sample: FuriganaSample
  tries: readonly string[]
  related: readonly ConverterSlug[]
}

export const furiganaTool: FuriganaTool = {
  card: { mark: 'ふ', sample: { text: '今日', furigana: [{ text: '今日', reading: 'きょう' }] } },
  sample: {
    text: '今日は大人一人と子供二人で、日本の映画を見に行きます。',
    furigana: [
      { text: '今日', reading: 'きょう' },
      { text: 'は' },
      { text: '大人', reading: 'おとな' },
      { text: '一人', reading: 'ひとり' },
      { text: 'と' },
      { text: '子供', reading: 'こども' },
      { text: '二人', reading: 'ふたり' },
      { text: 'で' },
      { text: '、' },
      { text: '日本', reading: 'にほん' },
      { text: 'の' },
      { text: '映画', reading: 'えいが' },
      { text: 'を' },
      { text: '見', reading: 'み' },
      { text: 'に' },
      { text: '行', reading: 'い' },
      { text: 'きます' },
      { text: '。' }
    ]
  },
  tries: ['大人', '明日', '日本語を勉強しています。', 'お茶を飲みませんか？'],
  related: ['kana-to-romaji', 'hiragana-to-katakana', 'romaji-to-kana']
}

export const furiganaReadingsUrl = (text: string) =>
  `${furiganaReadingsPath}?text=${encodeURIComponent(text)}`

export const composedText = (text: string) => text.normalize('NFC')

const escaped = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

export function furiganaHtml(segments: readonly RubySegment[]): string {
  return segments
    .map(({ text, reading }) =>
      reading
        ? `<ruby>${escaped(text)}<rp>（</rp><rt>${escaped(reading)}</rt><rp>）</rp></ruby>`
        : escaped(text).replaceAll('\n', '<br>')
    )
    .join('')
}

export function furiganaPlainText(segments: readonly RubySegment[]): string {
  return segments.map(({ text, reading }) => (reading ? `${text}（${reading}）` : text)).join('')
}
