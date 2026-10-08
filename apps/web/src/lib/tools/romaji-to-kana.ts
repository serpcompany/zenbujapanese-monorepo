import type { KanaScript } from '@zenbu/dictionary-core/browse/kana'
import { toKatakana } from './kana'
import { regularSyllables, type Spelling, vowels } from './syllables'

const otherSpellings: readonly Spelling[] = [
  ['shi', 'し'],
  ['chi', 'ち'],
  ['tsu', 'つ'],
  ['fu', 'ふ'],
  ['ji', 'じ'],
  ['ya', 'や'],
  ['yu', 'ゆ'],
  ['yo', 'よ'],
  ['ye', 'いぇ'],
  ['wa', 'わ'],
  ['wo', 'を'],
  ['wi', 'うぃ'],
  ['we', 'うぇ'],
  ['sha', 'しゃ'],
  ['shu', 'しゅ'],
  ['sho', 'しょ'],
  ['she', 'しぇ'],
  ['sya', 'しゃ'],
  ['syu', 'しゅ'],
  ['syo', 'しょ'],
  ['sye', 'しぇ'],
  ['cha', 'ちゃ'],
  ['chu', 'ちゅ'],
  ['cho', 'ちょ'],
  ['che', 'ちぇ'],
  ['tya', 'ちゃ'],
  ['tyu', 'ちゅ'],
  ['tyo', 'ちょ'],
  ['tye', 'ちぇ'],
  ['cya', 'ちゃ'],
  ['cyu', 'ちゅ'],
  ['cyo', 'ちょ'],
  ['ja', 'じゃ'],
  ['ju', 'じゅ'],
  ['jo', 'じょ'],
  ['je', 'じぇ'],
  ['jya', 'じゃ'],
  ['jyu', 'じゅ'],
  ['jyo', 'じょ'],
  ['zya', 'じゃ'],
  ['zyu', 'じゅ'],
  ['zyo', 'じょ'],
  ['zye', 'じぇ'],
  ['dya', 'ぢゃ'],
  ['dyo', 'ぢょ'],
  ['dyu', 'でゅ'],
  ['dhu', 'でゅ'],
  ['thi', 'てぃ'],
  ['dhi', 'でぃ'],
  ['twu', 'とぅ'],
  ['dwu', 'どぅ'],
  ['tsa', 'つぁ'],
  ['tsi', 'つぃ'],
  ['tse', 'つぇ'],
  ['tso', 'つぉ'],
  ['fyu', 'ふゅ'],
  ['kwa', 'くぁ'],
  ['kwi', 'くぃ'],
  ['kwe', 'くぇ'],
  ['kwo', 'くぉ'],
  ['gwa', 'ぐぁ'],
  ['who', 'うぉ'],
  ['wu', 'う'],
  ['fa', 'ふぁ'],
  ['fi', 'ふぃ'],
  ['fe', 'ふぇ'],
  ['fo', 'ふぉ'],
  ['va', 'ゔぁ'],
  ['vi', 'ゔぃ'],
  ['vu', 'ゔ'],
  ['ve', 'ゔぇ'],
  ['vo', 'ゔぉ'],
  ['xa', 'ぁ'],
  ['xi', 'ぃ'],
  ['xu', 'ぅ'],
  ['xe', 'ぇ'],
  ['xo', 'ぉ'],
  ['la', 'ぁ'],
  ['li', 'ぃ'],
  ['lu', 'ぅ'],
  ['le', 'ぇ'],
  ['lo', 'ぉ'],
  ['xya', 'ゃ'],
  ['xyu', 'ゅ'],
  ['xyo', 'ょ'],
  ['lya', 'ゃ'],
  ['lyu', 'ゅ'],
  ['lyo', 'ょ'],
  ['xtu', 'っ'],
  ['ltu', 'っ'],
  ['xtsu', 'っ'],
  ['ltsu', 'っ'],
  ['xwa', 'ゎ'],
  ['lwa', 'ゎ'],
  ['.', '。'],
  [',', '、'],
  ['[', '「'],
  [']', '」'],
  ['?', '？'],
  ['!', '！'],
  ['~', '〜']
]

const kanaOfRomaji = new Map<string, string>([...regularSyllables, ...otherSpellings])

const longestSpelling = Math.max(...[...kanaOfRomaji.keys()].map(romaji => romaji.length))

const macronVowels: Record<string, string> = {
  ā: 'a',
  ī: 'i',
  ū: 'u',
  ē: 'e',
  ō: 'o',
  â: 'a',
  î: 'i',
  û: 'u',
  ê: 'e',
  ô: 'o'
}

const apostrophes = ["'", '’']
const closedLips = ['b', 'm', 'p']
const doublingConsonant = /[bcdfghjkmpqrstvwxyz]/

function spellOutMacrons(text: string, script: KanaScript) {
  return text.replace(/[āīūēōâîûêô]/gi, letter => {
    const vowel = macronVowels[letter.toLowerCase()]
    if (script === 'katakana') return `${vowel}-`
    return vowel === 'o' ? 'ou' : vowel + vowel
  })
}

const isVowel = (letter: string) => letter !== '' && vowels.includes(letter)

type Step = { kana: string; length: number }

function syllabicN(lower: string, at: number): Step | null {
  const next = lower[at + 1] ?? ''
  if (next === 'n') {
    const after = lower[at + 2] ?? ''
    return { kana: 'ん', length: isVowel(after) || after === 'y' ? 1 : 2 }
  }
  if (apostrophes.includes(next)) return { kana: 'ん', length: 2 }
  if (!isVowel(next) && next !== 'y') return { kana: 'ん', length: 1 }
  return null
}

function doublesNextConsonant(lower: string, at: number) {
  const letter = lower[at]
  if (!doublingConsonant.test(letter)) return false
  return lower[at + 1] === letter || (letter === 't' && lower.startsWith('ch', at + 1))
}

function longestSyllable(lower: string, at: number): Step | null {
  for (let length = longestSpelling; length > 0; length--) {
    const romaji = lower.slice(at, at + length)
    const kana = romaji.length === length ? kanaOfRomaji.get(romaji) : undefined
    if (kana) return { kana, length }
  }
  return null
}

function nextStep(lower: string, original: string, at: number): Step {
  const letter = lower[at]
  if (letter === '-') return { kana: 'ー', length: 1 }
  const n = letter === 'n' ? syllabicN(lower, at) : null
  if (n) return n
  if (letter === 'm' && closedLips.includes(lower[at + 1])) return { kana: 'ん', length: 1 }
  if (doublesNextConsonant(lower, at)) return { kana: 'っ', length: 1 }
  return longestSyllable(lower, at) ?? { kana: original[at], length: 1 }
}

export function romajiToKana(input: string, script: KanaScript = 'hiragana'): string {
  const original = spellOutMacrons(input, script)
  const lower = original.replace(/[A-Z]/g, letter => letter.toLowerCase())
  let kana = ''
  for (let at = 0; at < lower.length; ) {
    const step = nextStep(lower, original, at)
    kana += step.kana
    at += step.length
  }
  return script === 'katakana' ? toKatakana(kana) : kana
}
