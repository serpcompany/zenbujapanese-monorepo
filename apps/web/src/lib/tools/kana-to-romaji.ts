import { toHiragana } from './kana'
import { regularSyllables, type Spelling } from './syllables'

const hepburnSpellings: readonly Spelling[] = [
  ['shi', 'し'],
  ['chi', 'ち'],
  ['tsu', 'つ'],
  ['fu', 'ふ'],
  ['ji', 'じ'],
  ['ji', 'ぢ'],
  ['zu', 'づ'],
  ['ya', 'や'],
  ['yu', 'ゆ'],
  ['yo', 'よ'],
  ['wa', 'わ'],
  ['o', 'を'],
  ['vu', 'ゔ'],
  ['ka', 'ゕ'],
  ['ke', 'ゖ'],
  ['a', 'ぁ'],
  ['i', 'ぃ'],
  ['u', 'ぅ'],
  ['e', 'ぇ'],
  ['o', 'ぉ'],
  ['ya', 'ゃ'],
  ['yu', 'ゅ'],
  ['yo', 'ょ'],
  ['wa', 'ゎ'],
  ['sha', 'しゃ'],
  ['shu', 'しゅ'],
  ['sho', 'しょ'],
  ['she', 'しぇ'],
  ['cha', 'ちゃ'],
  ['chu', 'ちゅ'],
  ['cho', 'ちょ'],
  ['che', 'ちぇ'],
  ['ja', 'じゃ'],
  ['ju', 'じゅ'],
  ['jo', 'じょ'],
  ['je', 'じぇ'],
  ['ja', 'ぢゃ'],
  ['ju', 'ぢゅ'],
  ['jo', 'ぢょ'],
  ['fa', 'ふぁ'],
  ['fi', 'ふぃ'],
  ['fe', 'ふぇ'],
  ['fo', 'ふぉ'],
  ['ti', 'てぃ'],
  ['di', 'でぃ'],
  ['tu', 'とぅ'],
  ['du', 'どぅ'],
  ['wi', 'うぃ'],
  ['we', 'うぇ'],
  ['wo', 'うぉ'],
  ['ye', 'いぇ'],
  ['va', 'ゔぁ'],
  ['vi', 'ゔぃ'],
  ['ve', 'ゔぇ'],
  ['vo', 'ゔぉ'],
  ['.', '。'],
  [',', '、'],
  ['"', '「'],
  ['"', '」'],
  ['?', '？'],
  ['!', '！'],
  [' ', '　'],
  [' ', '・'],
  ['~', '〜']
]

const romajiOfKana = new Map<string, string>(
  [...regularSyllables, ...hepburnSpellings].map(([romaji, kana]) => [kana, romaji])
)

const doubledStart = (romaji: string) =>
  romaji.startsWith('ch') ? 't' : /^[bcdfghjkmpqrstvwxyz]/.test(romaji) ? romaji[0] : ''

const longVowel = (romaji: string) => romaji.match(/[aiueo]$/)?.[0] ?? '-'

function spellingAt(text: string, at: number) {
  const pair = text.slice(at, at + 2)
  const paired = pair.length === 2 ? romajiOfKana.get(pair) : undefined
  if (paired) return { romaji: paired, length: 2 }
  const single = romajiOfKana.get(text[at])
  return single ? { romaji: single, length: 1 } : null
}

function nBefore(text: string, at: number) {
  const next = spellingAt(text, at)?.romaji ?? ''
  return /^[aiueoy]/.test(next) ? "n'" : 'n'
}

function spellingOf(text: string, at: number, romajiSoFar: string) {
  const character = text[at]
  if (character === 'ー') return { romaji: longVowel(romajiSoFar), length: 1 }
  if (character === 'ん') return { romaji: nBefore(text, at + 1), length: 1 }
  return spellingAt(text, at)
}

export function kanaToRomaji(input: string): string {
  const text = toHiragana(input)
  let romaji = ''
  let doubleNext = false
  for (let at = 0; at < text.length; ) {
    if (text[at] === 'っ') {
      doubleNext = true
      at += 1
      continue
    }
    const spelling = spellingOf(text, at, romaji)
    if (spelling && doubleNext) romaji += doubledStart(spelling.romaji)
    romaji += spelling?.romaji ?? text[at]
    at += spelling?.length ?? 1
    doubleNext = false
  }
  return romaji
}
