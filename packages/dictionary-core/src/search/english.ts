import { graphemeCount } from '../detail/text'
import {
  decodeEntry,
  type EntryRow,
  entryColumns,
  FormKind,
  profile,
  type SearchDatabase
} from './database'
import { ftsPhrase, ftsPrefix } from './fts'
import { normalizeQuery } from './query'
import {
  compareEnglishRanks,
  type EnglishRank,
  EvidenceLane,
  GlossRelation,
  isMarked,
  RomajiRelation
} from './rank'
import { deduplicated, minimum, type RankedEntry } from './ranked-entries'

const displayedFormProfileJoin = `LEFT JOIN form_priority_profiles p
  ON p.entry_id = e.id AND p.form = e.headword
  AND p.kind = CASE WHEN e.headword = e.reading THEN ${FormKind.reading} ELSE ${FormKind.written} END`

const hasSearchTerms = (value: string) => /[\p{L}\p{M}\p{N}]/u.test(value)
const escapeRegExp = (value: string) => value.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&')

export const glossToken = (query: string) =>
  new RegExp(`(?:^|[^a-z])${escapeRegExp(query)}(?:$|[^a-z])`, 'u')

function closingParenthesis(note: string): number | null {
  let depth = 0
  for (let index = 0; index < note.length; index++) {
    if (note[index] === '(') depth++
    if (note[index] === ')') {
      depth--
      if (depth === 0) return index
    }
  }
  return null
}

function endsInNote(gloss: string, phrase: string): boolean {
  if (!gloss.startsWith(`${phrase} (`)) return false
  let notes = gloss.slice(phrase.length + 1)
  for (let close = closingParenthesis(notes); close !== null; close = closingParenthesis(notes)) {
    notes = notes.slice(close + 1)
    if (notes === '') return true
    if (!notes.startsWith(' (')) return false
    notes = notes.slice(1)
  }
  return false
}

export function glossRelation(query: string, gloss: string, token: RegExp): number | null {
  const value = normalizeQuery(gloss)
  if (value === query) return GlossRelation.exactGloss
  if (endsInNote(value, query)) return GlossRelation.qualifiedGloss
  if (value === `to ${query}`) return GlossRelation.exactInfinitive
  if (endsInNote(value, `to ${query}`)) return GlossRelation.qualifiedInfinitive
  return token.test(value) ? GlossRelation.glossToken : null
}

interface GlossEvidence {
  relation: number
  senseOrder: number
  glossOrder: number
  meaning: string
}

function glossEvidencePrecedes(lhs: GlossEvidence, rhs: GlossEvidence): number {
  const lane = (evidence: GlossEvidence) => (evidence.relation === GlossRelation.glossToken ? 1 : 0)
  return (
    lane(lhs) - lane(rhs) ||
    lhs.senseOrder - rhs.senseOrder ||
    lhs.relation - rhs.relation ||
    lhs.glossOrder - rhs.glossOrder
  )
}

export async function rankedEnglish(
  db: SearchDatabase,
  query: string,
  exactFormOnly = false
): Promise<RankedEntry[]> {
  const evidence = exactFormOnly
    ? await exactRomajiEvidence(db, query)
    : await englishEvidence(db, query)
  if (!evidence) return []
  const { rows, glossMatches, romajiMatches } = evidence

  const ranked: RankedEntry[] = []
  for (const row of rows) {
    const entry = decodeEntry(row)
    const displayedFormPriority = profile(row)
    const gloss = glossMatches.get(entry.id) ?? []
    const romaji = romajiMatches.get(entry.id) ?? []
    const selectedGloss = minimum(gloss, glossEvidencePrecedes)
    const shared = {
      priorityPresenceRank: isMarked(displayedFormPriority) ? 0 : 1,
      priorityProfile: displayedFormPriority,
      headwordLength: graphemeCount(entry.headword),
      semanticFingerprint: row.semantic_fingerprint
    }
    if (!selectedGloss) {
      const romajiRelation = romaji.length > 0 ? Math.min(...romaji) : undefined
      if (romajiRelation === undefined) continue
      const rank: EnglishRank = {
        kind: 'english',
        lane: EvidenceLane.romajiOnly,
        corroborationRank: 0,
        romajiSpecificityRank: romajiRelation,
        senseOrder: 0,
        glossOrder: 0,
        ...shared
      }
      ranked.push({
        entry,
        rank,
        presentationRank: rank,
        hasExactOrPrefixMatch: romajiRelation !== RomajiRelation.contains,
        semanticFingerprint: row.semantic_fingerprint,
        matchedSummary: null
      })
      continue
    }
    const lane =
      selectedGloss.relation === GlossRelation.glossToken
        ? EvidenceLane.tokenGloss
        : EvidenceLane.strongGloss
    const corroborated =
      lane === EvidenceLane.strongGloss &&
      romaji.some(
        relation => relation === RomajiRelation.exact || relation === RomajiRelation.prefix
      )
    const rank: EnglishRank = {
      kind: 'english',
      lane,
      corroborationRank: corroborated ? 0 : 1,
      romajiSpecificityRank: 0,
      senseOrder: selectedGloss.senseOrder,
      glossOrder: selectedGloss.glossOrder,
      ...shared
    }
    ranked.push({
      entry,
      rank,
      presentationRank: rank,
      hasExactOrPrefixMatch: lane === EvidenceLane.strongGloss || corroborated,
      semanticFingerprint: row.semantic_fingerprint,
      matchedSummary: selectedGloss.meaning
    })
  }
  ranked.sort((lhs, rhs) => compareEnglishRanks(lhs.rank as EnglishRank, rhs.rank as EnglishRank))
  return deduplicated(ranked)
}

async function exactRomajiEvidence(db: SearchDatabase, query: string) {
  const rows = await db.all<EntryRow>(
    `SELECT ${entryColumns}, p.primary_mask, p.secondary_mask, p.news_frequency_band
       FROM forms f JOIN entries e ON e.id = f.entry_id ${displayedFormProfileJoin}
       WHERE f.kind = ${FormKind.romaji} AND f.form = ?`,
    [query]
  )
  return {
    rows,
    glossMatches: new Map<string, GlossEvidence[]>(),
    romajiMatches: new Map<string, number[]>(rows.map(row => [row.id, [RomajiRelation.exact]]))
  }
}

async function englishEvidence(db: SearchDatabase, query: string) {
  if (!hasSearchTerms(query)) return null
  const glossMatch = ftsPhrase(query)
  const romajiMatch = ftsPrefix(query)
  const [rows, glossMatches, romajiMatches] = await Promise.all([
    db.all<EntryRow>(
      `WITH candidates AS (
           SELECT g.entry_id FROM dictionary_gloss_fts x JOIN gloss_atoms g ON g.rowid = x.docid
           WHERE dictionary_gloss_fts MATCH ?
           UNION
           SELECT f.entry_id FROM dictionary_form_fts x JOIN forms f ON f.rowid = x.docid
           WHERE dictionary_form_fts MATCH ? AND f.kind = ${FormKind.romaji}
         )
         SELECT ${entryColumns}, p.primary_mask, p.secondary_mask, p.news_frequency_band
         FROM candidates c JOIN entries e ON e.id = c.entry_id ${displayedFormProfileJoin}`,
      [glossMatch, romajiMatch]
    ),
    glossEvidence(db, query, glossMatch),
    romajiEvidence(db, query, romajiMatch)
  ])
  return { rows, glossMatches, romajiMatches }
}

async function glossEvidence(
  db: SearchDatabase,
  query: string,
  match: string
): Promise<Map<string, GlossEvidence[]>> {
  const rows = await db.all<{
    entry_id: string
    sense_order: number
    gloss_order: number
    text: string
    headword: string
    reading: string
    written_forms: string
    readings: string
  }>(
    `SELECT lower(hex(g.entry_id)) AS entry_id, g.sense_order, g.gloss_order, g.text,
         e.headword, e.reading,
         (SELECT json_group_array(r.form) FROM sense_form_restrictions r
          WHERE r.entry_id = g.entry_id AND r.sense_order = g.sense_order
            AND r.kind = ${FormKind.written}) AS written_forms,
         (SELECT json_group_array(r.form) FROM sense_form_restrictions r
          WHERE r.entry_id = g.entry_id AND r.sense_order = g.sense_order
            AND r.kind = ${FormKind.reading}) AS readings
       FROM dictionary_gloss_fts x
       JOIN gloss_atoms g ON g.rowid = x.docid
       JOIN canonical_senses s ON s.entry_id = g.entry_id AND s.sense_order = g.sense_order
       JOIN entries e ON e.id = g.entry_id
       WHERE dictionary_gloss_fts MATCH ?`,
    [match]
  )
  const token = glossToken(query)
  const result = new Map<string, GlossEvidence[]>()
  for (const row of rows) {
    const senseWrittenForms: string[] = JSON.parse(row.written_forms)
    const senseReadings: string[] = JSON.parse(row.readings)
    const appliesToShownForms =
      (senseWrittenForms.length === 0 ||
        senseWrittenForms.includes(normalizeQuery(row.headword))) &&
      (senseReadings.length === 0 || senseReadings.includes(normalizeQuery(row.reading)))
    if (!appliesToShownForms) continue
    const relation = glossRelation(query, row.text, token)
    if (relation === null) continue
    const evidence = result.get(row.entry_id) ?? []
    evidence.push({
      relation,
      senseOrder: row.sense_order,
      glossOrder: row.gloss_order,
      meaning: row.text
    })
    result.set(row.entry_id, evidence)
  }
  return result
}

async function romajiEvidence(
  db: SearchDatabase,
  query: string,
  match: string
): Promise<Map<string, number[]>> {
  const rows = await db.all<{ entry_id: string; form: string }>(
    `SELECT lower(hex(f.entry_id)) AS entry_id, f.form
       FROM dictionary_form_fts x JOIN forms f ON f.rowid = x.docid
       WHERE dictionary_form_fts MATCH ? AND f.kind = ${FormKind.romaji}`,
    [match]
  )
  const result = new Map<string, number[]>()
  for (const row of rows) {
    const relation =
      row.form === query
        ? RomajiRelation.exact
        : row.form.startsWith(query)
          ? RomajiRelation.prefix
          : RomajiRelation.contains
    const relations = result.get(row.entry_id) ?? []
    if (!relations.includes(relation)) relations.push(relation)
    result.set(row.entry_id, relations)
  }
  return result
}
