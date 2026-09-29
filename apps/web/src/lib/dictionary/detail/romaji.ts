// Romaji, as the app's Reading Aids show it (ReadingAidPresentation.swift's
// AppleJapaneseRomanization): Foundation's `.toLatin` transform (ICU's Any-Latin) of a trusted
// reading, without corrections of its own, so は stays "ha" and おう stays "ou", while ー becomes a
// macron (コーヒー is "kōhī"). ICU isn't available to the website, so this ports what that
// transform does to Japanese kana, checked against the app by the word-detail and kanji-detail
// suites' recorded romaji and, in its tests, against the transform itself.

/** Each katakana's Latin, as Katakana-Latin writes it alone. */
const kana: Record<string, string> = {
  ァ: '~a',
  ア: 'a',
  ィ: '~i',
  イ: 'i',
  ゥ: '~u',
  ウ: 'u',
  ェ: '~e',
  エ: 'e',
  ォ: '~o',
  オ: 'o',
  カ: 'ka',
  ガ: 'ga',
  キ: 'ki',
  ギ: 'gi',
  ク: 'ku',
  グ: 'gu',
  ケ: 'ke',
  ゲ: 'ge',
  コ: 'ko',
  ゴ: 'go',
  サ: 'sa',
  ザ: 'za',
  シ: 'shi',
  ジ: 'ji',
  ス: 'su',
  ズ: 'zu',
  セ: 'se',
  ゼ: 'ze',
  ソ: 'so',
  ゾ: 'zo',
  タ: 'ta',
  ダ: 'da',
  チ: 'chi',
  ヂ: 'dji',
  ッ: '~tsu',
  ツ: 'tsu',
  ヅ: 'dzu',
  テ: 'te',
  デ: 'de',
  ト: 'to',
  ド: 'do',
  ナ: 'na',
  ニ: 'ni',
  ヌ: 'nu',
  ネ: 'ne',
  ノ: 'no',
  ハ: 'ha',
  バ: 'ba',
  パ: 'pa',
  ヒ: 'hi',
  ビ: 'bi',
  ピ: 'pi',
  フ: 'fu',
  ブ: 'bu',
  プ: 'pu',
  ヘ: 'he',
  ベ: 'be',
  ペ: 'pe',
  ホ: 'ho',
  ボ: 'bo',
  ポ: 'po',
  マ: 'ma',
  ミ: 'mi',
  ム: 'mu',
  メ: 'me',
  モ: 'mo',
  ャ: '~ya',
  ヤ: 'ya',
  ュ: '~yu',
  ユ: 'yu',
  ョ: '~yo',
  ヨ: 'yo',
  ラ: 'ra',
  リ: 'ri',
  ル: 'ru',
  レ: 're',
  ロ: 'ro',
  ヮ: '~wa',
  ワ: 'wa',
  ヰ: 'wi',
  ヱ: 'we',
  ヲ: 'wo',
  ン: 'n',
  ヴ: 'vu',
  ヵ: '~ka',
  ヶ: '~ke',
  ヷ: 'va',
  ヸ: 'vi',
  ヹ: 've',
  ヺ: 'vo'
}

/** The pairs Katakana-Latin writes as one syllable. */
const digraphs: Record<string, string> = {
  キィ: 'kyi',
  キェ: 'kye',
  キャ: 'kya',
  キュ: 'kyu',
  キョ: 'kyo',
  ギィ: 'gyi',
  ギェ: 'gye',
  ギャ: 'gya',
  ギュ: 'gyu',
  ギョ: 'gyo',
  シェ: 'she',
  シャ: 'sha',
  シュ: 'shu',
  ショ: 'sho',
  ジェ: 'je',
  ジャ: 'ja',
  ジュ: 'ju',
  ジョ: 'jo',
  セィ: 'si',
  ゼィ: 'zi',
  チェ: 'che',
  チャ: 'cha',
  チュ: 'chu',
  チョ: 'cho',
  ヂェ: 'dje',
  ヂャ: 'dja',
  ヂュ: 'dju',
  ヂョ: 'djo',
  ティ: 'ti',
  テゥ: 'tu',
  ディ: 'di',
  デゥ: 'du',
  ニィ: 'nyi',
  ニェ: 'nye',
  ニャ: 'nya',
  ニュ: 'nyu',
  ニョ: 'nyo',
  ヒィ: 'hyi',
  ヒェ: 'hye',
  ヒャ: 'hya',
  ヒュ: 'hyu',
  ヒョ: 'hyo',
  ビィ: 'byi',
  ビェ: 'bye',
  ビャ: 'bya',
  ビュ: 'byu',
  ビョ: 'byo',
  ピィ: 'pyi',
  ピェ: 'pye',
  ピャ: 'pya',
  ピュ: 'pyu',
  ピョ: 'pyo',
  ファ: 'fa',
  フィ: 'fi',
  フェ: 'fe',
  フォ: 'fo',
  ヘゥ: 'hu',
  ミィ: 'myi',
  ミェ: 'mye',
  ミャ: 'mya',
  ミュ: 'myu',
  ミョ: 'myo',
  リィ: 'ryi',
  リェ: 'rye',
  リャ: 'rya',
  リュ: 'ryu',
  リョ: 'ryo'
}

/** ン takes an apostrophe before these, so "n'a" isn't read as "na". */
const apostropheBefore = new Set('アイウエオナニヌネノヤユヨンヴ')
/** ッ stays "~tsu" before these; before anything else it doubles the next consonant. */
const sokuonKeptBefore = new Set('ァアィイゥウェエォオッャュョヮヴヵヶヽヾ')

/** Voiced kana, for the voiced iteration mark ヾ. */
const voiced: Record<string, string> = {
  k: 'g',
  s: 'z',
  sh: 'j',
  t: 'd',
  ch: 'dj',
  ts: 'dz'
}

const isHiragana = (c: string) => c >= 'ぁ' && c <= 'ゖ'
const isKatakana = (c: string) => c >= 'ァ' && c <= 'ヺ'
const combiningMacron = String.fromCharCode(0x304)

type Script = 'hiragana' | 'katakana' | 'common' | 'other'

/**
 * The script ICU's Any-Latin reads a character as. ゝ and ゞ are hiragana, ヽ and ヾ katakana;
 * other letters are another script; everything else (ー, punctuation, digits, spaces) is common,
 * and belongs to the run of the letter before it, or at the start the one after it.
 */
function script(c: string): Script {
  if (isHiragana(c) || c === 'ゝ' || c === 'ゞ') return 'hiragana'
  if (isKatakana(c) || c === 'ヽ' || c === 'ヾ') return 'katakana'
  return (c !== 'ー' && /\p{L}/u.test(c)) || c === '〇' ? 'other' : 'common'
}

/** Hiragana as katakana, as ICU's Hiragana-Latin reads it; ゕ and ゖ stay. */
function toKatakana(c: string): string {
  if (c === 'ゝ') return 'ヽ'
  if (c === 'ゞ') return 'ヾ'
  if (isHiragana(c) && c !== 'ゕ' && c !== 'ゖ')
    return String.fromCodePoint((c.codePointAt(0) ?? 0) + 0x60)
  return c
}

/** Half-width katakana as full-width, as Any-Latin reads them. */
function widen(value: string): string {
  return value.replace(/[ｦ-ﾟ]+/g, run => run.normalize('NFKC'))
}

/** The last syllable of Latin, which an iteration mark repeats ("shi" repeats as "hi"). */
function lastSyllable(latin: string): string {
  return latin.match(/(?:[bcdfghjklmnpqrstvwxz]?y?[aeiou]|n)$/)?.[0] ?? ''
}

/**
 * Kana, and the common characters among them, in Latin; `scripts` is each character's run. A
 * hiragana run is read as katakana together with the text after it (さんエ is "san'e"), but a
 * katakana run doesn't read the hiragana after it (ボタンあな is "botanana"). ー in a kana run is
 * a macron; Katakana-Latin writes 、 and 。 as "," and ".", and Hiragana-Latin leaves them.
 */
function runToLatin(run: string[], scripts: Script[]): string {
  const chars = run.map(toKatakana)
  let out = ''
  let previous = ''
  for (let index = 0; index < chars.length; index++) {
    const c = chars[index]
    const pair = c + (chars[index + 1] ?? '')
    const kind = scripts[index]
    if (c === 'ー') {
      out += combiningMacron
      continue
    }
    if (c === '、' || c === '。') {
      out += kind === 'katakana' ? (c === '、' ? ',' : '.') : c
      previous = ''
      continue
    }
    if (kind !== 'hiragana' && kind !== 'katakana') {
      out += c
      previous = ''
      continue
    }
    if (c === 'ヽ' || c === 'ヾ') {
      let repeated = previous === '~tsu' ? 'su' : lastSyllable(previous)
      if (c === 'ヾ' && previous === '~tsu') repeated = 'dzu'
      else if (c === 'ヾ') {
        const match = repeated.match(/^(sh|ch|ts|[kst])(.*)$/)
        if (match) repeated = voiced[match[1]] + match[2]
      }
      out += repeated
      continue
    }
    if (c === 'ッ') {
      const next = chars[index + 1]
      const following = next ? (digraphs[next + (chars[index + 2] ?? '')] ?? kana[next]) : undefined
      // Katakana ッ doubles kana of either script; hiragana っ doesn't double katakana パ-row
      // kana (おっパブ is "o~tsupabu").
      const doubles =
        kind === 'katakana' ||
        scripts[index + 1] === 'hiragana' ||
        !'パピプペポ'.includes(next ?? '')
      if (next && following && doubles && !sokuonKeptBefore.has(next)) {
        out += following.startsWith('ch') ? 't' : following[0]
        previous = ''
        continue
      }
      out += '~tsu'
      previous = '~tsu'
      continue
    }
    if (c === 'ン') {
      const next = chars[index + 1]
      const reads = kind === 'hiragana' || scripts[index + 1] === 'katakana'
      out += next && reads && apostropheBefore.has(next) ? "n'" : 'n'
      previous = 'n'
      continue
    }
    const latin = digraphs[pair]
    if (latin) {
      out += latin
      previous = latin
      index++
      continue
    }
    const single = kana[c] ?? c
    out += single
    previous = single
  }
  return out
}

/** Greek letters, which Any-Latin also writes in Latin (α-helix, βカロテン). */
const greek: Record<string, string> = {
  α: 'a',
  β: 'b',
  γ: 'g',
  δ: 'd',
  ε: 'e',
  ζ: 'z',
  η: 'ē',
  θ: 'th',
  ι: 'i',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'x',
  ο: 'o',
  π: 'p',
  ρ: 'r',
  σ: 's',
  ς: 's',
  τ: 't',
  υ: 'y',
  φ: 'ph',
  χ: 'ch',
  ψ: 'ps',
  ω: 'ō',
  Α: 'A',
  Β: 'B',
  Γ: 'G',
  Δ: 'D',
  Ε: 'E',
  Ζ: 'Z',
  Η: 'Ē',
  Θ: 'Th',
  Ι: 'I',
  Κ: 'K',
  Λ: 'L',
  Μ: 'M',
  Ν: 'N',
  Ξ: 'X',
  Ο: 'O',
  Π: 'P',
  Ρ: 'R',
  Σ: 'S',
  Τ: 'T',
  Υ: 'Y',
  Φ: 'Ph',
  Χ: 'Ch',
  Ψ: 'Ps',
  Ω: 'Ō',
  // Han-like characters outside the ranges the app refuses, which Any-Latin reads in pinyin.
  〇: 'líng',
  '⻌': 'chuò'
}

/**
 * `.toLatin` on Japanese text: each run of hiragana or katakana in Latin, Greek letters in Latin,
 * and everything else as it was. ー, 、, and 。 join the run before them, or at the start the one
 * after; a lone ー stays.
 */
export function toLatin(value: string): string {
  const chars = Array.from(widen(value))
  const scripts = chars.map(script)
  let before: Script | null = null
  for (const [index, kind] of scripts.entries()) {
    if (kind === 'common') {
      if (before) scripts[index] = before
    } else before = kind
  }
  let after: Script | null = null
  for (let index = scripts.length - 1; index >= 0; index--) {
    if (scripts[index] === 'common') {
      if (after) scripts[index] = after
    } else after = scripts[index]
  }
  const isKana = (kind: Script | undefined) => kind === 'hiragana' || kind === 'katakana'
  let out = ''
  let index = 0
  while (index < chars.length) {
    if (isKana(scripts[index])) {
      // Kana of either script, with the common characters among them.
      const start = index
      while (index < chars.length && isKana(scripts[index])) index++
      out += runToLatin(chars.slice(start, index), scripts.slice(start, index))
      continue
    }
    out += greek[chars[index]] ?? chars[index]
    index++
  }
  return out.normalize('NFC')
}

/** Han or 々, which the app never romanizes. */
const hanOrIterationMark = /[々㐀-鿿豈-﫿\u{20000}-\u{2fa1f}]/u

/**
 * `AppleJapaneseRomanization.romanizeTrustedReading`: the reading in Latin, or null when it's
 * empty or has kanji (the app shows no romaji then).
 */
export function romanizeTrustedReading(reading: string): string | null {
  if (reading === '' || hanOrIterationMark.test(reading)) return null
  return toLatin(reading)
}

/** A token of an example sentence, as `romanizeCompleteSentence` reads it. */
export interface RomajiToken {
  surface: string
  /** The parser's reading, in katakana; missing, empty, or `*` when it has none. */
  reading?: string
}

type LineBreak = 'normal' | 'attachesToPrevious' | 'attachesToNext'

/**
 * `String.japaneseTokenLineBreakBehavior` (LinkedJapaneseText.swift): punctuation alone attaches
 * to the word before it, or to the one after it when it opens (「, ().
 */
function lineBreak(surface: string): LineBreak {
  if (surface === '' || !/^[\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Po}]+$/u.test(surface)) return 'normal'
  return /^[\p{Ps}\p{Pi}]/u.test(surface) ? 'attachesToNext' : 'attachesToPrevious'
}

/**
 * `AppleJapaneseRomanization.romanizeCompleteSentence`: each word's reading in Latin, separated
 * by spaces except around punctuation; null when a word has kanji and no reading, when the app
 * says "Romaji unavailable for this text".
 */
export function romanizeCompleteSentence(tokens: readonly RomajiToken[]): string | null {
  if (tokens.length === 0) return null
  let result = ''
  let previous: LineBreak | null = null
  for (const token of tokens) {
    // Swift's allSatisfy is true for an empty surface too.
    if (/^\s*$/u.test(token.surface)) {
      result += token.surface
      previous = null
      continue
    }
    let trusted: string
    if (token.reading && token.reading !== '*') trusted = token.reading
    else {
      if (hanOrIterationMark.test(token.surface)) return null
      trusted = token.surface
    }
    const piece = romanizeTrustedReading(trusted)
    if (piece === null) return null
    const behavior = lineBreak(token.surface)
    if (
      result === '' ||
      /\s$/u.test(result) ||
      behavior === 'attachesToPrevious' ||
      previous === 'attachesToNext'
    ) {
      result += piece
    } else {
      result += ` ${piece}`
    }
    previous = behavior
  }
  return result
}
