import { writtenLanguage } from '@zenbu/dictionary-core/search/query'
import type { Direction } from './messages'

export const japaneseToEnglish: Direction = { from: 'ja', to: 'en' }
const englishToJapanese: Direction = { from: 'en', to: 'ja' }

export function directionOf(text: string): Direction | null {
  switch (writtenLanguage(text)) {
    case 'ja':
      return japaneseToEnglish
    case 'en':
      return englishToJapanese
    default:
      return null
  }
}
