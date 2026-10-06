import { kanjiDetail } from '@zenbu/dictionary-core/detail/kanji'
import type { KanjiRows } from '@zenbu/dictionary-core/detail/rows'
import { fixtureKanjiRows } from '@zenbu/dictionary-core/fixtures'
import type { KanjiDetailsData } from '@/lib/dictionary/kanji-details'

function unlinked<Item>(item: Item): Item & { path: null } {
  return { ...item, path: null }
}

export function fixtureKanji(character: string): KanjiRows {
  const rows = fixtureKanjiRows.find(rows => rows.kanji.character === character)
  if (!rows) throw new Error(`No fixture for ${character}`)
  return rows
}

export function unlinkedKanjiDetails(rows: KanjiRows): KanjiDetailsData {
  const detail = kanjiDetail(rows)
  return {
    ...detail,
    readings: detail.readings.map(reading => ({ ...reading, words: reading.words.map(unlinked) })),
    components: detail.components.map(character => unlinked({ character })),
    elements: detail.elements.map(unlinked),
    words: detail.words.map(unlinked)
  }
}
