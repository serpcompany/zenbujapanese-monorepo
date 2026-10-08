export interface WidthOptions {
  katakana: boolean
  lettersAndNumbers: boolean
  symbolsAndSpaces: boolean
}

export const everyWidthChange: WidthOptions = {
  katakana: true,
  lettersAndNumbers: true,
  symbolsAndSpaces: true
}

const halfKatakana = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ'
const fullKatakana =
  'ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン'
const halfMarks = { voiced: 'ﾞ', semivoiced: 'ﾟ' } as const
const halfSoundMarks = `${halfMarks.voiced}${halfMarks.semivoiced}`
const fullSoundMarks = '゛゜'
const halfPunctuation = '｡｢｣､･'
const fullPunctuation = '。「」、・'
const asciiToFullWidth = 0xfee0
const fullWidthAscii = { first: 0xff01, last: 0xff5e }
const fullWidthSpace = '　'

const pairs = (from: string, to: string) =>
  new Map(Array.from(from, (character, index) => [character, to[index]]))

const voiced = pairs(
  'カキクケコサシスセソタチツテトハヒフヘホウワヲ',
  'ガギグゲゴザジズゼゾダヂヅデドバビブベボヴヷヺ'
)
const semivoiced = pairs('ハヒフヘホ', 'パピプペポ')
const reversed = (map: Map<string, string>) => new Map([...map].map(([from, to]) => [to, from]))
const unvoiced = reversed(voiced)
const unsemivoiced = reversed(semivoiced)

const swap = (character: string, from: string, to: string) => {
  const index = from.indexOf(character)
  return index < 0 ? null : to[index]
}

const shift = (character: string, offset: number) =>
  String.fromCharCode(character.charCodeAt(0) + offset)

const isLetterOrNumber = (character: string) => /^[A-Za-z0-9]$/.test(character)
const isAsciiSymbol = (character: string) => /^[!-/:-@[-`{-~]$/.test(character)

function joinSoundMark(kana: string, mark: string | undefined) {
  if (mark === halfMarks.voiced) return voiced.get(kana) ?? null
  if (mark === halfMarks.semivoiced) return semivoiced.get(kana) ?? null
  return null
}

function widenOther(character: string, options: WidthOptions) {
  const katakanaMark = options.katakana ? swap(character, halfSoundMarks, fullSoundMarks) : null
  const punctuation = options.symbolsAndSpaces
    ? swap(character, halfPunctuation, fullPunctuation)
    : null
  if (katakanaMark ?? punctuation) return katakanaMark ?? punctuation
  if (isLetterOrNumber(character)) {
    return options.lettersAndNumbers ? shift(character, asciiToFullWidth) : character
  }
  if (isAsciiSymbol(character)) {
    return options.symbolsAndSpaces ? shift(character, asciiToFullWidth) : character
  }
  return character === ' ' && options.symbolsAndSpaces ? fullWidthSpace : character
}

export function halfToFull(text: string, options: WidthOptions): string {
  let full = ''
  for (let at = 0; at < text.length; at++) {
    const kana = options.katakana ? swap(text[at], halfKatakana, fullKatakana) : null
    if (!kana) {
      full += widenOther(text[at], options)
      continue
    }
    const joined = joinSoundMark(kana, text[at + 1])
    full += joined ?? kana
    if (joined) at++
  }
  return full
}

function narrowKatakana(character: string) {
  const plain = swap(character, fullKatakana, halfKatakana)
  if (plain) return plain
  const voicedBase = unvoiced.get(character)
  if (voicedBase) return `${swap(voicedBase, fullKatakana, halfKatakana)}${halfMarks.voiced}`
  const semivoicedBase = unsemivoiced.get(character)
  if (semivoicedBase) {
    return `${swap(semivoicedBase, fullKatakana, halfKatakana)}${halfMarks.semivoiced}`
  }
  return swap(character, fullSoundMarks, halfSoundMarks)
}

function narrowOther(character: string, options: WidthOptions) {
  const code = character.charCodeAt(0)
  if (code >= fullWidthAscii.first && code <= fullWidthAscii.last) {
    const narrow = shift(character, -asciiToFullWidth)
    const wanted = isLetterOrNumber(narrow) ? options.lettersAndNumbers : options.symbolsAndSpaces
    return wanted ? narrow : character
  }
  if (!options.symbolsAndSpaces) return character
  if (character === fullWidthSpace) return ' '
  return swap(character, fullPunctuation, halfPunctuation) ?? character
}

export function fullToHalf(text: string, options: WidthOptions): string {
  return Array.from(text, character => {
    const kana = options.katakana ? narrowKatakana(character) : null
    return kana ?? narrowOther(character, options)
  }).join('')
}
