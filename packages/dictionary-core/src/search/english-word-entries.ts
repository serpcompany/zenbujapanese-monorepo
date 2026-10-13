import { graphemeCount } from '../detail/text'
import { resultItems, type SearchResultItem } from './composition'
import { decodeEntry, type EntryRow, entryColumns, profile, type SearchDatabase } from './database'
import { displayedFormProfileJoin, rankedByStrongGloss } from './english'
import { type EnglishRank, EvidenceLane, isMarked } from './rank'

const wordIndex = 'word_index'

interface WordEntryRow extends EntryRow {
  word: string
}

async function hasWordIndex(db: SearchDatabase): Promise<boolean> {
  const attached = await db.all('SELECT name FROM pragma_database_list WHERE name = ?', [wordIndex])
  return attached.length > 0
}

export async function entriesExamplesUse(
  db: SearchDatabase,
  words: readonly string[]
): Promise<Map<string, EntryRow>> {
  if (words.length === 0 || !(await hasWordIndex(db))) return new Map()
  const rows = await db.all<WordEntryRow>(
    `SELECT w.word, ${entryColumns}, p.primary_mask, p.secondary_mask, p.news_frequency_band
       FROM json_each(?) listed
       JOIN ${wordIndex}.english_word_entries w ON w.word = listed.value AND w.place = 0
       JOIN entries e ON e.id = w.entry_id ${displayedFormProfileJoin}`,
    [JSON.stringify(words)]
  )
  return new Map(rows.map(row => [row.word, row]))
}

function usedInExamples(row: EntryRow): SearchResultItem {
  const entry = decodeEntry(row)
  const priority = profile(row)
  const matchRank: EnglishRank = {
    kind: 'english',
    lane: EvidenceLane.exampleSentences,
    corroborationRank: 1,
    romajiSpecificityRank: 0,
    senseOrder: 0,
    glossOrder: 0,
    priorityPresenceRank: isMarked(priority) ? 0 : 1,
    priorityProfile: priority,
    headwordLength: graphemeCount(entry.headword),
    semanticFingerprint: row.semantic_fingerprint
  }
  return { entry, sourceOrder: 0, matchRank, fallbackOrder: 0, matchedSummary: null }
}

export async function candidatesFromExamples(
  db: SearchDatabase,
  word: string,
  used: EntryRow
): Promise<SearchResultItem[]> {
  const meaning = (await rankedByStrongGloss(db, word)).find(ranked => ranked.entry.id === used.id)
  return meaning ? resultItems([meaning]) : [usedInExamples(used)]
}
