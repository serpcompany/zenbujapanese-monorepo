import { graphemeCount } from '../detail/text'
import {
  decodeEntry,
  type EntryRow,
  entryColumns,
  FormKind,
  profile,
  type SearchDatabase,
  type SearchEntry
} from './database'
import { compareStrings } from './query'
import {
  compareJapaneseRanks,
  compareProfiles,
  FormRelation,
  type JapaneseRank,
  type PriorityProfile
} from './rank'
import { deduplicated, minimum, type RankedEntry } from './ranked-entries'

export interface JapaneseRow extends EntryRow {
  form: string
  kind: number
  sense_count: number
}

const maximumFormsPerQuery = 100

const readingRestrictionFilter = `(
  f.kind != ${FormKind.reading}
  OR NOT EXISTS (
    SELECT 1 FROM reading_form_restrictions r WHERE r.entry_id = f.entry_id AND r.reading = f.form
  )
  OR EXISTS (
    SELECT 1 FROM reading_form_restrictions r
    WHERE r.entry_id = f.entry_id AND r.reading = f.form AND r.written_form = e.headword
  )
)`

function containsFilter(query: string): { sql: string; params: string[] } {
  return { sql: 'instr(f.form, ?) > 0', params: [query] }
}

export function rankJapanese(query: string, rows: JapaneseRow[]): RankedEntry[] {
  const byEntry = new Map<
    string,
    {
      entry: SearchEntry
      fingerprint: string
      senseCount: number
      evidence: { relation: number; form: string; profile: PriorityProfile }[]
    }
  >()
  for (const row of rows) {
    const exact = row.form === query
    const prefix = row.form.startsWith(query)
    const relation = (row.kind === FormKind.written ? 0 : 1) + (exact ? 0 : prefix ? 2 : 4)
    const current = byEntry.get(row.id) ?? {
      entry: decodeEntry(row),
      fingerprint: row.semantic_fingerprint,
      senseCount: row.sense_count,
      evidence: []
    }
    current.evidence.push({ relation, form: row.form, profile: profile(row) })
    byEntry.set(row.id, current)
  }

  const ranked: RankedEntry[] = []
  for (const { entry, fingerprint, senseCount, evidence } of byEntry.values()) {
    const selected = minimum(evidence, (lhs, rhs) => {
      if (lhs.relation !== rhs.relation) return lhs.relation - rhs.relation
      const profiles = compareProfiles(lhs.profile, rhs.profile)
      return profiles || compareStrings(lhs.form, rhs.form)
    })
    if (!selected) continue
    const rank: JapaneseRank = {
      kind: 'japanese',
      relation: selected.relation,
      priorityProfile: selected.profile,
      senseBreadthRank: -senseCount,
      headwordLength: graphemeCount(entry.headword),
      semanticFingerprint: fingerprint
    }
    ranked.push({
      entry,
      rank,
      presentationRank: rank,
      hasExactOrPrefixMatch: selected.relation < FormRelation.writtenContains,
      semanticFingerprint: fingerprint,
      matchedSummary: null
    })
  }
  ranked.sort((lhs, rhs) =>
    compareJapaneseRanks(lhs.rank as JapaneseRank, rhs.rank as JapaneseRank)
  )
  return deduplicated(ranked)
}

export async function hasFormContaining(db: SearchDatabase, query: string): Promise<boolean> {
  const filter = containsFilter(query)
  const rows = await db.all(
    `SELECT 1 FROM forms f JOIN entries e ON e.id = f.entry_id
       WHERE f.kind IN (${FormKind.written}, ${FormKind.reading})
         AND ${filter.sql}
         AND ${readingRestrictionFilter}
       LIMIT 1`,
    filter.params
  )
  return rows.length > 0
}

export async function rankedJapanese(db: SearchDatabase, query: string): Promise<RankedEntry[]> {
  const filter = containsFilter(query)
  return rankJapanese(query, await japaneseRows(db, filter.sql, filter.params))
}

export async function rankedJapaneseForms(
  db: SearchDatabase,
  terms: string[]
): Promise<Map<string, RankedEntry[]>> {
  const distinct = [...new Set(terms)].filter(term => term !== '')
  const batches: string[][] = []
  for (let start = 0; start < distinct.length; start += maximumFormsPerQuery) {
    batches.push(distinct.slice(start, start + maximumFormsPerQuery))
  }
  const rowsByTerm = new Map<string, JapaneseRow[]>()
  const rows = await Promise.all(
    batches.map(batch => japaneseRows(db, `f.form IN (${batch.map(() => '?').join(', ')})`, batch))
  )
  for (const row of rows.flat()) {
    const termRows = rowsByTerm.get(row.form) ?? []
    termRows.push(row)
    rowsByTerm.set(row.form, termRows)
  }
  return new Map(distinct.map(term => [term, rankJapanese(term, rowsByTerm.get(term) ?? [])]))
}

function japaneseRows(
  db: SearchDatabase,
  where: string,
  params: readonly string[]
): Promise<JapaneseRow[]> {
  return db.all<JapaneseRow>(
    `SELECT ${entryColumns}, f.form, f.kind,
         (SELECT count(*) FROM canonical_senses s WHERE s.entry_id = e.id) AS sense_count,
         p.primary_mask, p.secondary_mask, p.news_frequency_band
       FROM forms f
       JOIN entries e ON e.id = f.entry_id
       LEFT JOIN form_priority_profiles p
         ON p.entry_id = f.entry_id AND p.form = f.form AND p.kind = f.kind
       WHERE f.kind IN (${FormKind.written}, ${FormKind.reading})
         AND ${where}
         AND ${readingRestrictionFilter}`,
    params
  )
}
