// Ports the word selection in lookupSegments
// (apps/ios/Modules/Sources/SearchExperience/JapaneseTextAnalysisClient.swift). The analyzer
// itself is a capability each client supplies or leaves out; this selection is shared.
import { isJapaneseOnly, normalizeQuery } from './query'

/** One word from a Japanese morphological analyzer such as the app's Sudachi. */
export interface MorphologyWord {
  surface: string
  /** The word's dictionary form; `*` or empty when the analyzer has none. */
  dictionaryForm: string
  /** Part-of-speech tags, most general first, such as 名詞 or 動詞. */
  partOfSpeech: readonly string[]
  isOutOfVocabulary: boolean
}

/** Splits Japanese text into words. */
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

/**
 * The words sentence search looks up, as the app picks them: Japanese words the analyzer
 * knows, of a part of speech that links to the dictionary, in their dictionary forms.
 */
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
