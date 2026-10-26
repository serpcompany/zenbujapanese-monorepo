import { containsJapaneseText } from './query'
import { romajiQuery } from './romaji-forms'

const latinLetter = /\p{Script=Latin}/u
const combiningMark = /\p{Mn}/gu

export function latinSpellings(text: string): string[] {
  if (romajiQuery(text) !== null || !latinLetter.test(text) || containsJapaneseText(text)) return []
  const unaccented = text.normalize('NFD').replace(combiningMark, '').normalize('NFC')
  return unaccented === text ? [text] : [text, unaccented]
}
