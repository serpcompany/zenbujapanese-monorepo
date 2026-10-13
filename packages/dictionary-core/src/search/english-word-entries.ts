import { graphemeCount } from '../detail/text'
import type { SearchResultItem } from './composition'
import { decodeEntry, type EntryRow, entryColumns, profile, type SearchDatabase } from './database'
import { displayedFormProfileJoin, glossToken } from './english'
import { type EnglishRank, EvidenceLane, isMarked } from './rank'

const wordIndex = 'word_index'

export interface EntryExamplesUse extends EntryRow {
  word: string
  pairs_with_both: number
  glosses: string
}

async function hasWordIndex(db: SearchDatabase): Promise<boolean> {
  const attached = await db.all('SELECT name FROM pragma_database_list WHERE name = ?', [wordIndex])
  return attached.length > 0
}

const isAPieceOfAnAbbreviation = (word: string) => word.length === 1

export async function entriesExamplesUse(
  db: SearchDatabase,
  words: readonly string[]
): Promise<Map<string, EntryExamplesUse[]>> {
  const asked = [...new Set(words)].filter(word => !isAPieceOfAnAbbreviation(word))
  const used = new Map<string, EntryExamplesUse[]>()
  if (asked.length === 0 || !(await hasWordIndex(db))) return used
  const rows = await db.all<EntryExamplesUse>(
    `SELECT w.word, w.pairs_with_both,
         (SELECT json_group_array(g.normalized_text) FROM gloss_atoms g
          WHERE g.entry_id = w.entry_id) AS glosses,
         ${entryColumns}, p.primary_mask, p.secondary_mask, p.news_frequency_band
       FROM json_each(?) listed
       JOIN ${wordIndex}.english_word_entries w ON w.word = listed.value
       JOIN entries e ON e.id = w.entry_id ${displayedFormProfileJoin}
       ORDER BY w.word, w.place`,
    [JSON.stringify(asked)]
  )
  for (const row of rows) used.set(row.word, [...(used.get(row.word) ?? []), row])
  return used
}

export function mentions(used: EntryExamplesUse, words: readonly string[]): boolean {
  const glosses: string[] = JSON.parse(used.glosses)
  return words.some(word => {
    const asAWholeWord = glossToken(word)
    return glosses.some(gloss => asAWholeWord.test(gloss))
  })
}

const takesSuru = 'takesSuru'

export const isASuruVerb = (used: EntryExamplesUse) =>
  decodeEntry(used).partsOfSpeech.includes(takesSuru)

const sharedPairsOfASplit = { numerator: 7, denominator: 10 }

export function areSplitBetween(first: EntryExamplesUse, other: EntryExamplesUse): boolean {
  const { numerator, denominator } = sharedPairsOfASplit
  return denominator * other.pairs_with_both >= numerator * first.pairs_with_both
}

export function usedInExamples(row: EntryRow): SearchResultItem {
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
