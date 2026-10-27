import { type KanjiDetail, savedKanjiReading } from '@zenbu/dictionary-core/detail/kanji'

export interface SavedItem {
  id: string
  headword: string
  reading: string
}

export const wordItem = (word: {
  languageReferenceId: string
  headword: string
  reading: string
}): SavedItem => ({ id: word.languageReferenceId, headword: word.headword, reading: word.reading })

export const kanjiItem = (kanji: Pick<KanjiDetail, 'character' | 'readings'>): SavedItem => ({
  id: `kanji:${kanji.character.normalize('NFC')}`,
  headword: kanji.character,
  reading: savedKanjiReading(kanji)
})
