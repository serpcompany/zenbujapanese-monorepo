import { isJapaneseOnly, normalizeQuery } from './query'

export interface MorphologyWord {
  surface: string
  dictionaryForm: string
  partOfSpeech: readonly string[]
  isOutOfVocabulary: boolean
}

export interface Morpheme extends MorphologyWord {
  begin: number
  end: number
  normalizedForm: string
  reading: string
}

export interface MorphologyAnalysis {
  words: readonly Morpheme[]
  pieces?: readonly Morpheme[]
}

export interface MorphologyAnalyzer {
  analyze(text: string): Promise<MorphologyAnalysis>
}

export interface AnalyzedWord extends Morpheme {
  pieces: Morpheme[]
}

export function analyzedWords({ words, pieces = [] }: MorphologyAnalysis): AnalyzedWord[] {
  const analyzed: AnalyzedWord[] = []
  for (const word of words) {
    const inside: Morpheme[] = []
    for (const piece of pieces) {
      if (piece.begin >= word.begin && piece.end <= word.end) inside.push(piece)
    }
    analyzed.push({ ...word, pieces: inside })
  }
  return analyzed
}

const linkablePartsOfSpeech = new Set([
  '名詞',
  '動詞',
  '形容詞',
  '形状詞',
  '代名詞',
  '接頭辞',
  '接尾辞',
  '感動詞',
  '副詞',
  '連体詞',
  '接続詞'
])

const grammarPartsOfSpeech = new Set(['助詞', '助動詞', '補助記号', '空白'])

const affixPartsOfSpeech = new Set(['接頭辞', '接尾辞'])

const leadingPartOfSpeech = (word: MorphologyWord) => word.partOfSpeech[0] ?? ''

function isLookedUp(word: MorphologyWord): boolean {
  return (
    isJapaneseOnly(normalizeQuery(word.surface)) &&
    linkablePartsOfSpeech.has(leadingPartOfSpeech(word)) &&
    !word.isOutOfVocabulary
  )
}

export function lookupForm(word: MorphologyWord): string {
  const form =
    word.dictionaryForm === '*' || word.dictionaryForm === '' ? word.surface : word.dictionaryForm
  return normalizeQuery(form)
}

export function lookedUpWords<Word extends MorphologyWord>(words: readonly Word[]): Word[] {
  return words.filter(isLookedUp)
}

export function lookupSegments(words: readonly MorphologyWord[]): string[] {
  return lookedUpWords(words).map(lookupForm)
}

export function isOneWordPhrase(words: readonly MorphologyWord[]): boolean {
  const lookedUp = lookedUpWords(words)
  if (lookedUp.length !== 1 || affixPartsOfSpeech.has(leadingPartOfSpeech(lookedUp[0]))) {
    return false
  }
  return words.every(
    word =>
      word === lookedUp[0] ||
      (!word.isOutOfVocabulary && grammarPartsOfSpeech.has(leadingPartOfSpeech(word)))
  )
}
