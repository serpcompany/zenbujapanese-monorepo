export const vowels = 'aiueo'

const vowelKana = 'あいうえお'

const consonantRows = {
  k: 'かきくけこ',
  g: 'がぎぐげご',
  s: 'さしすせそ',
  z: 'ざじずぜぞ',
  t: 'たちつてと',
  d: 'だぢづでど',
  n: 'なにぬねの',
  h: 'はひふへほ',
  b: 'ばびぶべぼ',
  p: 'ぱぴぷぺぽ',
  m: 'まみむめも',
  r: 'らりるれろ'
} as const

const rowsWithContractions = 'kgnhbpmr'

const smallY = [
  ['ya', 'ゃ'],
  ['yu', 'ゅ'],
  ['yo', 'ょ']
] as const

export type Spelling = readonly [romaji: string, kana: string]

function regularSpellings(): Spelling[] {
  const spellings: Spelling[] = Array.from(vowels, (vowel, index) => [vowel, vowelKana[index]])
  for (const [consonant, row] of Object.entries(consonantRows)) {
    spellings.push(...Array.from(row, (kana, index): Spelling => [consonant + vowels[index], kana]))
    if (!rowsWithContractions.includes(consonant)) continue
    spellings.push(...smallY.map(([y, small]): Spelling => [consonant + y, row[1] + small]))
  }
  return spellings
}

export const regularSyllables: readonly Spelling[] = regularSpellings()
