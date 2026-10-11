import { toKatakana } from '../examples/kana'
import { graphemes } from './text'

type Step = (text: string[], start: number, limit: number) => number

interface Replacement {
  length: number
  written: string
  advance?: number
}

const within =
  (accepts: RegExp, step: Step): Step =>
  (text, start, limit) => {
    let position = start
    let end = limit
    for (;;) {
      while (position < end && !accepts.test(text[position])) position++
      let runEnd = position
      while (runEnd < end && accepts.test(text[runEnd])) runEnd++
      if (position === runEnd) return end
      const changedEnd = step(text, position, runEnd)
      end += changedEnd - runEnd
      position = changedEnd
    }
  }

const inOrder =
  (...steps: Step[]): Step =>
  (text, start, limit) =>
    steps.reduce((end, step) => step(text, start, end), limit)

const rewritten =
  (rewrite: (written: string) => string): Step =>
  (text, start, limit) => {
    const written = text.slice(start, limit).join('')
    const changed = rewrite(written)
    if (changed === written) return limit
    const replacement = Array.from(changed)
    text.splice(start, limit - start, ...replacement)
    return start + replacement.length
  }

const normalized = (form: 'NFC' | 'NFD') => rewritten(written => written.normalize(form))

const voicedMark = '\u3099'
const voicingMarks = '\u3099\u309b'
const semiVoicingMarks = '\u309a\u309c'

const widened: Step = (text, start, limit) => {
  for (let position = start; position < limit; position++) {
    if (/^[\uff66-\uff9f]$/u.test(text[position])) text[position] = text[position].normalize('NFKC')
  }
  return limit
}

const decomposed = (rules: string) =>
  new Map(
    rules.split(' ').map(rule => {
      const [kana, latin] = rule.split(':')
      return [kana.normalize('NFD'), latin] as const
    })
  )

const syllables = decomposed(
  '。:. 、:, ヷ:va ヸ:vi ヹ:ve ヺ:vo ヵ:~ka ヶ:~ke ~ャ:ya ~ィ:yi ~ュ:yu ~ェ:ye ~ョ:yo ア:a バ:ba ビ:bi ブ:bu ベ:be ボ:bo ダ:da ディ:di デゥ:du デ:de ド:do ヅ:dzu ヂャ:dja ヂィ:dji~i ヂュ:dju ヂェ:dje ヂョ:djo ヂ:dji チャ:cha チィ:chi~i チュ:chu チェ:che チョ:cho チ:chi エ:e ガ:ga ギ:gi グ:gu ゲ:ge ゴ:go イ:i ジャ:ja ジィ:ji~i ジュ:ju ジェ:je ジョ:jo ジ:ji カ:ka キ:ki ク:ku ケ:ke コ:ko マ:ma ミ:mi ム:mu メ:me モ:mo ナ:na ニ:ni ヌ:nu ネ:ne ノ:no オ:o パ:pa ピ:pi プ:pu ペ:pe ポ:po ハ:ha ヒ:hi ヘゥ:hu ヘ:he ホ:ho ファ:fa フィ:fi フェ:fe フォ:fo フ:fu ラ:ra リ:ri ル:ru レ:re ロ:ro ザ:za ゼィ:zi ズ:zu ゼ:ze ゾ:zo サ:sa セィ:si ス:su セ:se ソ:so シャ:sha シィ:shi~i シュ:shu シェ:she ショ:sho シ:shi タ:ta ティ:ti テゥ:tu テ:te ト:to ツ:tsu ヴ:vu ウ:u ワ:wa ヰ:wi ヱ:we ヲ:wo ヤ:ya ユ:yu ヨ:yo ー:\u0304 ァ:~a ィ:~i ゥ:~u ェ:~e ォ:~o ッ:~tsu ヮ:~wa ャ:~ya ュ:~yu ョ:~yo ン:n'
)
const longestSyllable = 3

const glides = decomposed('ビ:b ギ:g キ:k ミ:m ニ:n ピ:p ヒ:h リ:r')
const glidingVowels = 'ィェャュョ'

const doubling: readonly (readonly [following: string, marks: string | null, latin: string])[] = [
  ['しシ', voicingMarks, 'j'],
  ['はひへほハヒヘホふフ', voicingMarks, 'b'],
  ['たちつてとタチツテト', voicingMarks, 'd'],
  ['かきくけこカキクケコ', voicingMarks, 'g'],
  ['はひへほハヒヘホふフ', semiVoicingMarks, 'p'],
  ['さしすせそサシスセソ', voicingMarks, 'z'],
  ['ワヰヱヲ', voicedMark, 'v'],
  ['かきくけこカキクケコ', null, 'k'],
  ['まみむめもマミムメモ', null, 'm'],
  ['なにぬねのナニヌネノン', null, 'n'],
  ['はひへほハヒヘホ', null, 'h'],
  ['ふフ', null, 'f'],
  ['らりるれろラリルレロ', null, 'r'],
  ['たちつてとタチツテト', null, 't'],
  ['さしすせそサシスセソ', null, 's'],
  ['わゐゑをワヰヱヲ', null, 'w'],
  ['やゆよヤユヨ', null, 'y']
]

const nasalBreaks = 'アイウエオナニヌネノヤユヨン'

const repeatedVoicings = [
  ['sh', 'j'],
  ['ch', 'dj'],
  ['ts', 'dz'],
  ['k', 'g'],
  ['s', 'z'],
  ['t', 'd'],
  ['b', 'h'],
  ['w', 'v'],
  ['j', 'j'],
  ['dz', 'dz']
] as const

const isIn = (characters: string, character: string | undefined) =>
  character !== undefined && characters.includes(character)

function doubledConsonant(text: string[], position: number): string | null {
  const following = text[position + 1]
  const mark = text[position + 2]
  const found = doubling.find(
    ([characters, marks]) => isIn(characters, following) && (marks === null || isIn(marks, mark))
  )
  return found ? found[2] : null
}

function repeatedSyllable(text: string[], position: number, limit: number): Replacement {
  const voiced = position + 1 < limit && isIn(voicingMarks, text[position + 1])
  const length = voiced ? 2 : 1
  if (isIn('aeiou', text[position - 1])) {
    let start = position - 1
    while (text[start - 1] === 'y') start--
    const glide = text.slice(start, position).join('')
    const before = text.slice(Math.max(0, start - 2), start).join('')
    const voicing = voiced && repeatedVoicings.find(([unvoiced]) => before.endsWith(unvoiced))
    if (voicing) return { length, written: voicing[1] + glide }
    if (/^[b-df-hj-np-tv-z]$/.test(text[start - 1] ?? '')) {
      return { length, written: text[start - 1] + glide }
    }
  }
  const previous = text[position - 1]
  return {
    length,
    written: previous === undefined || /[\r\n\u2028\u2029]/.test(previous) ? '' : previous
  }
}

function replacement(text: string[], position: number, limit: number): Replacement | null {
  const character = text[position]
  if (character === 'ヽ') return repeatedSyllable(text, position, limit)
  if (character === 'ッ') {
    const consonant = doubledConsonant(text, position)
    if (consonant !== null) return { length: 1, written: consonant }
  }
  if (character === 'ン' && isIn(nasalBreaks, text[position + 1])) {
    return { length: 1, written: "n'" }
  }
  for (let length = Math.min(longestSyllable, limit - position); length > 0; length--) {
    const kana = text.slice(position, position + length).join('')
    const glide = glides.get(kana)
    if (glide !== undefined && isIn(glidingVowels, text[position + length])) {
      return { length, written: `${glide}~`, advance: 1 }
    }
    const latin = syllables.get(kana)
    if (latin !== undefined) return { length, written: latin }
  }
  return null
}

const toLatin: Step = (text, start, limit) => {
  let position = start
  let end = limit
  while (position < end) {
    const found = replacement(text, position, end)
    if (found === null) {
      position++
      continue
    }
    const written = Array.from(found.written)
    text.splice(position, found.length, ...written)
    end += written.length - found.length
    position += found.advance ?? written.length
  }
  return end
}

const katakanaLatin = within(
  /^[\u0304\u3099-\u309c -~\u00a2\u00a3\u00a5\u00a6\u00ac\u20a9\uff61-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc\uffe8-\uffee、。がぎぐげござじずぜぞだぢづでどばぱびぴぶぷべぺぼぽゔゞ\u30a0-ヺー-ヾ]$/u,
  inOrder(
    within(/^[\p{sc=Katakana}\u309b\u309c\u30a0ー\uff70\uff9e\uff9f]$/u, widened),
    normalized('NFD'),
    toLatin,
    normalized('NFC')
  )
)

const hiraganaLatin = within(
  /^[\u3099ぁ-ゔゝゞガギグゲゴザジズゼゾダヂヅデドバビブベボヴヷ-ヺーヾ]$/u,
  inOrder(normalized('NFD'), rewritten(toKatakana), katakanaLatin, normalized('NFC'))
)

const scripts: readonly (readonly [RegExp, Step | null])[] = [
  [/^[\p{sc=Common}\p{sc=Inherited}]$/u, null],
  [/^\p{sc=Hiragana}$/u, hiraganaLatin],
  [/^\p{sc=Katakana}$/u, katakanaLatin]
]

const unscripted = scripts.length
const scriptOf = (character: string) => {
  const found = scripts.findIndex(([pattern]) => pattern.test(character))
  return found < 0 ? unscripted : found
}
const shared = 0

function latin(value: string): string {
  const text = Array.from(value)
  let limit = 0
  while (limit < text.length) {
    let start = limit
    while (start > 0 && scriptOf(text[start - 1]) === shared) start--
    let script = shared
    while (limit < text.length) {
      const next = scriptOf(text[limit])
      if (next !== shared) {
        if (script === shared) script = next
        else if (next !== script) break
      }
      limit++
    }
    const step = scripts[script]?.[1]
    if (step) limit = step(text, start, limit)
  }
  return text.join('')
}

const kanji = /[\u3005\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}]/u

export function romaji(reading: string): string | null {
  return reading === '' || kanji.test(reading) ? null : latin(reading)
}

export type Attachment = 'previous' | 'next'

export function attachment(surface: string): Attachment | null {
  if (!/^[\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Po}]+$/u.test(surface)) return null
  return /^[\p{Ps}\p{Pi}]/u.test(surface) ? 'next' : 'previous'
}

export interface SpokenWord {
  surface: string
  reading: string | null
}

const startsWithSpace = (character: string | undefined) =>
  character !== undefined && /^\p{White_Space}/u.test(character)

export function sentenceRomaji(words: readonly SpokenWord[]): string | null {
  if (words.length === 0) return null
  let sentence = ''
  let previous: Attachment | null = null
  for (const { surface, reading } of words) {
    if (graphemes(surface).every(startsWithSpace)) {
      sentence += surface
      previous = null
      continue
    }
    const spoken = reading !== null && reading !== '' && reading !== '*' ? reading : surface
    const piece = romaji(spoken)
    if (piece === null) return null
    const attaches = attachment(surface)
    const joined =
      sentence === '' ||
      startsWithSpace(graphemes(sentence).at(-1)) ||
      attaches === 'previous' ||
      previous === 'next'
    sentence += joined ? piece : ` ${piece}`
    previous = attaches
  }
  return sentence
}
