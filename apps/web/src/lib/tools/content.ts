import type { WidthOptions } from './width'

export type Phrase = string | { japanese: string } | { latin: string } | { typed: string }
export type RichText = readonly Phrase[]

const phraseText = (phrase: Phrase) =>
  typeof phrase === 'string'
    ? phrase
    : 'japanese' in phrase
      ? phrase.japanese
      : 'typed' in phrase
        ? phrase.typed
        : phrase.latin

export const plainText = (text: RichText) => text.map(phraseText).join('')

export function withKeys(text: RichText) {
  const seen = new Map<string, number>()
  return text.map(phrase => {
    const content = phraseText(phrase)
    const count = (seen.get(content) ?? 0) + 1
    seen.set(content, count)
    return { key: `${content}#${count}`, phrase }
  })
}

const marked = /<(ja|latin|typed)>([^<]*)<\/\1>/g

const phraseOf = (kind: string, text: string): Phrase =>
  kind === 'ja' ? { japanese: text } : kind === 'latin' ? { latin: text } : { typed: text }

export function richText(template: string): RichText {
  const phrases: Phrase[] = []
  let last = 0
  for (const match of template.matchAll(marked)) {
    const index = match.index ?? 0
    if (index > last) phrases.push(template.slice(last, index))
    phrases.push(phraseOf(match[1], match[2]))
    last = index + match[0].length
  }
  if (last < template.length) phrases.push(template.slice(last))
  return phrases
}

export type Examples = readonly (readonly [from: string, to: string])[]

export const typingTipExamples = {
  n: [
    ['onna', 'おんな'],
    ["kin'en", 'きんえん']
  ],
  nBeforeLabial: [['shimbun', 'しんぶん']],
  smallTsu: [
    ['kitte', 'きって'],
    ['matcha', 'まっちゃ']
  ],
  longMark: [['ko-hi-', 'こーひー']],
  smallKana: [
    ['xa', 'ぁ'],
    ['ltu', 'っ']
  ],
  wo: [['wo', 'を']],
  punctuation: [
    ['.', '。'],
    [',', '、'],
    ['[', '「'],
    [']', '」']
  ]
} as const satisfies Record<string, Examples>

export const spellingRuleExamples = {
  smallTsu: [
    ['きって', 'kitte'],
    ['まっちゃ', 'matcha']
  ],
  nBeforeVowel: [
    ['きんえん', "kin'en"],
    ['しんよう', "shin'you"]
  ],
  longVowels: [['とうきょう', 'toukyou']],
  longMark: [['コーヒー', 'koohii']],
  wo: [['を', 'o']],
  kanji: []
} as const satisfies Record<string, Examples>

export interface WidthRowShape {
  id: 'katakana' | 'voiced' | 'letters' | 'numbers' | 'punctuation' | 'space' | 'hiragana'
  half: string
  full: string
  change: keyof WidthOptions | null
}

export const widthRowShapes: readonly WidthRowShape[] = [
  { id: 'katakana', half: 'ｶﾀｶﾅ', full: 'カタカナ', change: 'katakana' },
  { id: 'voiced', half: 'ｶﾞ ﾊﾟ', full: 'ガ パ', change: 'katakana' },
  { id: 'letters', half: 'ABC abc', full: 'ＡＢＣ ａｂｃ', change: 'lettersAndNumbers' },
  { id: 'numbers', half: '123', full: '１２３', change: 'lettersAndNumbers' },
  { id: 'punctuation', half: '｡､｢｣', full: '。、「」', change: 'symbolsAndSpaces' },
  { id: 'space', half: 'A B', full: 'A　B', change: 'symbolsAndSpaces' },
  { id: 'hiragana', half: 'ひらがな', full: 'ひらがな', change: null }
]
