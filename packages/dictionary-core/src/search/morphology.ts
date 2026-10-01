import { isJapaneseOnly, normalizeQuery } from './query'

export interface MorphologyWord {
  surface: string
  dictionaryForm: string
  partOfSpeech: readonly string[]
  isOutOfVocabulary: boolean
}

export interface MorphologyAnalyzer {
  analyze(text: string): Promise<MorphologyWord[]>
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
