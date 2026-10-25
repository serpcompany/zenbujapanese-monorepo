import type { Morpheme } from './morphology'

export type MorphemePart = readonly [surface: string, dictionaryForm: string, partOfSpeech: string]

export function morphemes(parts: readonly MorphemePart[], from = 0): Morpheme[] {
  let begin = from
  return parts.map(([surface, dictionaryForm, partOfSpeech]) => {
    const end = begin + [...surface].length
    const morpheme = {
      surface,
      begin,
      end,
      dictionaryForm,
      normalizedForm: dictionaryForm,
      reading: surface,
      partOfSpeech: [partOfSpeech],
      isOutOfVocabulary: false
    }
    begin = end
    return morpheme
  })
}
