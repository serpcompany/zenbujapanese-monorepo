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
  '感動詞'
])

export function lookupSegments(words: readonly MorphologyWord[]): string[] {
  return words.flatMap(word => {
    if (
      !isJapaneseOnly(normalizeQuery(word.surface)) ||
      !linkablePartsOfSpeech.has(word.partOfSpeech[0] ?? '') ||
      word.isOutOfVocabulary
    ) {
      return []
    }
    const form =
      word.dictionaryForm === '*' || word.dictionaryForm === '' ? word.surface : word.dictionaryForm
    return [normalizeQuery(form)]
  })
}
