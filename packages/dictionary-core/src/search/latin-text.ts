import { containsJapaneseText } from './query'
import { romajiQuery, withoutMarks } from './romaji-forms'

const latinLetter = /\p{Script=Latin}/u

export function latinSpellings(text: string): string[] {
  if (!latinLetter.test(text) || containsJapaneseText(text) || romajiQuery(text) !== null) return []
  const unaccented = withoutMarks(text)
  return unaccented === text ? [text] : [text, unaccented]
}
