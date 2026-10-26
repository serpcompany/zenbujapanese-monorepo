import { romaji } from '../detail/romaji'
import { isASCII, normalizeQuery } from './query'

const asciiSyllables = new Map(
  'あ:a い:i う:u え:e お:o か:ka き:ki く:ku け:ke こ:ko が:ga ぎ:gi ぐ:gu げ:ge ご:go さ:sa し:shi す:su せ:se そ:so ざ:za じ:ji ず:zu ぜ:ze ぞ:zo た:ta ち:chi つ:tsu て:te と:to だ:da ぢ:ji づ:zu で:de ど:do な:na に:ni ぬ:nu ね:ne の:no は:ha ひ:hi ふ:fu へ:he ほ:ho ば:ba び:bi ぶ:bu べ:be ぼ:bo ぱ:pa ぴ:pi ぷ:pu ぺ:pe ぽ:po ま:ma み:mi む:mu め:me も:mo や:ya ゆ:yu よ:yo ら:ra り:ri る:ru れ:re ろ:ro わ:wa ゐ:wi ゑ:we を:o ん:n ゔ:vu きゃ:kya きゅ:kyu きょ:kyo ぎゃ:gya ぎゅ:gyu ぎょ:gyo しゃ:sha しゅ:shu しょ:sho じゃ:ja じゅ:ju じょ:jo ちゃ:cha ちゅ:chu ちょ:cho にゃ:nya にゅ:nyu にょ:nyo ひゃ:hya ひゅ:hyu ひょ:hyo びゃ:bya びゅ:byu びょ:byo ぴゃ:pya ぴゅ:pyu ぴょ:pyo みゃ:mya みゅ:myu みょ:myo りゃ:rya りゅ:ryu りょ:ryo'
    .split(' ')
    .map(rule => rule.split(':') as [string, string])
)

const firstKatakana = 0x30a1
const lastShiftedKatakana = 0x30f6
const katakanaToHiragana = 0x60
const asciiSeparators = "・ -'"
const vowels = 'aeiou'
const unDoubled = 'aeioun'

const shiftedToHiragana = (character: string) => {
  const unit = character.codePointAt(0) ?? 0
  return unit >= firstKatakana && unit <= lastShiftedKatakana
    ? String.fromCodePoint(unit - katakanaToHiragana)
    : character
}

function lastVowel(written: string | undefined): string {
  for (const letter of Array.from(written ?? '').reverse()) {
    if (vowels.includes(letter)) return letter
  }
  return ''
}

function asciiRomaji(reading: string): string {
  const text = Array.from(reading.normalize('NFKC'), shiftedToHiragana)
  const written: string[] = []
  let doubles = false
  let index = 0
  while (index < text.length) {
    const character = text[index]
    if (character === 'っ') {
      doubles = true
      index++
      continue
    }
    if (character === 'ー') {
      if (written.length > 0) written.push(lastVowel(written.at(-1)))
      index++
      continue
    }
    let syllable = asciiSyllables.get(character + (text[index + 1] ?? ''))
    if (syllable) index += 2
    else {
      syllable = asciiSyllables.get(character)
      index++
    }
    if (!syllable) {
      if (asciiSeparators.includes(character)) written.push('-')
      continue
    }
    if (doubles && !unDoubled.includes(syllable[0])) written.push(syllable[0])
    written.push(syllable)
    doubles = false
  }
  return written.join('').replace(/^-+|-+$/g, '')
}

const romajiSeparators = /[・、。〜]/gu
const macronVowels = '\u{101}\u{113}\u{12b}\u{14d}\u{16b}'
const romajiLetters = new RegExp(`^[\\0-\\x7f${macronVowels}\\u{304}]*$`, 'u')
const latinLetter = new RegExp(`[a-z${macronVowels}]`, 'u')

export function romajiQuery(query: string): string | null {
  if (isASCII(query)) return query
  const separated = query.replace(romajiSeparators, ' ').split(' ').filter(Boolean).join(' ')
  return romajiLetters.test(separated) && latinLetter.test(separated) ? separated : null
}

const combiningMarks = /\p{Mn}/gu

export const withoutMarks = (form: string) =>
  form.normalize('NFD').replace(combiningMarks, '').normalize('NFC')

function shownForm(reading: string): string | null {
  const shown = romaji(reading)
  return shown === null ? null : romajiQuery(normalizeQuery(shown))
}

interface RomajiSearchForms {
  romaji: string[]
  shownRomaji: string[]
  unmarkedRomaji: string[]
}

export function romajiSearchForms(readings: readonly string[]): RomajiSearchForms {
  const typed = new Set<string>()
  for (const reading of readings) {
    const spelled = asciiRomaji(reading)
    if (spelled) typed.add(spelled)
  }
  const shown = new Set<string>()
  for (const reading of readings) {
    const written = shownForm(reading)
    if (written && !typed.has(written)) shown.add(written)
  }
  const unmarked = new Set<string>()
  for (const written of shown) {
    const plain = withoutMarks(written)
    if (plain !== written && !typed.has(plain) && !shown.has(plain)) unmarked.add(plain)
  }
  return { romaji: [...typed], shownRomaji: [...shown], unmarkedRomaji: [...unmarked] }
}
