import { expect, test } from 'vitest'
import type {
  EntryRow,
  KanjiElementRow,
  KanjiGlossRow,
  KanjiRow,
  KanjiStructureRow,
  KanjiWordRow
} from '../lib/dictionary/detail/rows'
import type { elementGlyphs, kanji, kanjiElements, words } from './dictionary-schema'

// Type checks, run by `pnpm typecheck`: a selected row fills the detail core's rows as it is, so
// the dictionary database can't drift from what the pages read.
type Word = typeof words.$inferSelect
const fills = {
  entry: (row: Word): EntryRow => row,
  // Whether a written form contains the kanji depends on the page, so the page adds it.
  kanjiWord: (row: Word): Omit<KanjiWordRow, 'containsKanji'> => row,
  kanji: (row: typeof kanji.$inferSelect): KanjiRow => row,
  kanjiGloss: (row: typeof kanji.$inferSelect): KanjiGlossRow => row,
  structure: (row: typeof kanjiElements.$inferSelect): KanjiStructureRow => row,
  element: (row: typeof elementGlyphs.$inferSelect): KanjiElementRow => row
}

test('dictionary database rows fill the detail core rows', () => {
  expect(Object.keys(fills)).toHaveLength(6)
})
