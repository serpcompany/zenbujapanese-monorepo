import { graphemeCount } from '../detail/text'
import {
  decodeEntry,
  type EntryRow,
  entryColumns,
  FormKind,
  profile,
  type SearchDatabase,
  stopIfInterrupted
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

const isStoredExactOrPrefix = (relation: number) =>
  relation === RomajiRelation.exact || relation === RomajiRelation.prefix

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

const glossLane = (evidence: GlossEvidence) =>
  evidence.relation === GlossRelation.glossToken ? 1 : 0

function glossEvidencePrecedes(lhs: GlossEvidence, rhs: GlossEvidence): number {
  return (
    glossLane(lhs) - glossLane(rhs) ||
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
  let step = 0
  for (const row of rows) {
    stopIfInterrupted(db, step++)
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
        hasExactOrPrefixMatch: isStoredExactOrPrefix(romajiRelation),
        semanticFingerprint: row.semantic_fingerprint,
        matchedSummary: null
      })
      continue
    }
    const lane =
      selectedGloss.relation === GlossRelation.glossToken
        ? EvidenceLane.tokenGloss
        : EvidenceLane.strongGloss
    const corroborated = lane === EvidenceLane.strongGloss && romaji.some(isStoredExactOrPrefix)
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
  ranked.sort((lhs, rhs) => {
    stopIfInterrupted(db, step++)
    return compareEnglishRanks(lhs.rank as EnglishRank, rhs.rank as EnglishRank)
  })
  return deduplicated(ranked, db)
}

async function exactRomajiEvidence(db: SearchDatabase, query: string) {
  const rows = await db.all<EntryRow & { kind: number }>(
    `SELECT ${entryColumns}, p.primary_mask, p.secondary_mask, p.news_frequency_band, f.kind
       FROM forms f JOIN entries e ON e.id = f.entry_id ${displayedFormProfileJoin}
       WHERE f.kind = ${FormKind.romaji} AND f.form = ?
     UNION ALL
     SELECT ${entryColumns}, p.primary_mask, p.secondary_mask, p.news_frequency_band, f.kind
       FROM shown_romaji_forms f JOIN entries e ON e.id = f.entry_id ${displayedFormProfileJoin}
       WHERE f.kind = ${FormKind.shownRomaji} AND f.form = ?`,
    [query, query]
  )
  return {
    rows,
    glossMatches: new Map<string, GlossEvidence[]>(),
    romajiMatches: new Map<string, number[]>(
      rows.map(row => [row.id, [romajiRelation(query, row.kind, query)]])
    )
  }
}

async function englishEvidence(db: SearchDatabase, query: string) {
  if (!hasSearchTerms(query)) return null
  const [glossMatches, romajiMatches] = await Promise.all([
    glossEvidence(db, query, ftsPhrase(query)),
    romajiEvidence(db, query, ftsPrefix(query))
  ])
  const ids = [...new Set([...glossMatches.keys(), ...romajiMatches.keys()])]
  const rows =
    ids.length === 0
      ? []
      : await db.all<EntryRow>(
          `SELECT ${entryColumns}, p.primary_mask, p.secondary_mask, p.news_frequency_band
             FROM json_each(?) j JOIN entries e ON e.id = unhex(j.value) ${displayedFormProfileJoin}`,
          [JSON.stringify(ids)]
        )
  return { rows, glossMatches, romajiMatches }
}

interface SenseRestrictions {
  writtenForms: string[]
  readings: string[]
}

async function senseRestrictions(
  db: SearchDatabase,
  entryIds: readonly string[]
): Promise<Map<string, SenseRestrictions>> {
  const restrictions = new Map<string, SenseRestrictions>()
  if (entryIds.length === 0) return restrictions
  const rows = await db.all<{ entry_id: string; sense_order: number; kind: number; form: string }>(
    `SELECT lower(hex(r.entry_id)) AS entry_id, r.sense_order, r.kind, r.form
       FROM json_each(?) j JOIN sense_form_restrictions r ON r.entry_id = unhex(j.value)`,
    [JSON.stringify(entryIds)]
  )
  for (const row of rows) {
    const key = `${row.entry_id} ${row.sense_order}`
    const sense = restrictions.get(key) ?? { writtenForms: [], readings: [] }
    if (row.kind === FormKind.written) sense.writtenForms.push(row.form)
    if (row.kind === FormKind.reading) sense.readings.push(row.form)
    restrictions.set(key, sense)
  }
  return restrictions
}

const unrestricted: SenseRestrictions = { writtenForms: [], readings: [] }

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
  }>(
    `SELECT lower(hex(g.entry_id)) AS entry_id, g.sense_order, g.gloss_order, g.text,
         e.headword, e.reading
       FROM dictionary_gloss_fts x
       JOIN gloss_atoms g ON g.rowid = x.docid
       JOIN canonical_senses s ON s.entry_id = g.entry_id AND s.sense_order = g.sense_order
       JOIN entries e ON e.id = g.entry_id
       WHERE dictionary_gloss_fts MATCH ?`,
    [match]
  )
  const restrictions = await senseRestrictions(db, [...new Set(rows.map(row => row.entry_id))])
  const token = glossToken(query)
  const result = new Map<string, GlossEvidence[]>()
  let step = 0
  for (const row of rows) {
    stopIfInterrupted(db, step++)
    const sense = restrictions.get(`${row.entry_id} ${row.sense_order}`) ?? unrestricted
    const appliesToShownForms =
      (sense.writtenForms.length === 0 ||
        sense.writtenForms.includes(normalizeQuery(row.headword))) &&
      (sense.readings.length === 0 || sense.readings.includes(normalizeQuery(row.reading)))
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

const relationsByKind: Record<number, readonly [exact: number, prefix: number, contains: number]> =
  {
    [FormKind.romaji]: [RomajiRelation.exact, RomajiRelation.prefix, RomajiRelation.contains],
    [FormKind.shownRomaji]: [
      RomajiRelation.shownExact,
      RomajiRelation.shownPrefix,
      RomajiRelation.shownContains
    ],
    [FormKind.unmarkedRomaji]: [
      RomajiRelation.unmarkedExact,
      RomajiRelation.unmarkedPrefix,
      RomajiRelation.unmarkedContains
    ]
  }

function romajiRelation(form: string, kind: number, query: string): number {
  const [exact, prefix, contains] = relationsByKind[kind]
  return form === query ? exact : form.startsWith(query) ? prefix : contains
}

async function romajiEvidence(
  db: SearchDatabase,
  query: string,
  match: string
): Promise<Map<string, number[]>> {
  const rows = await db.all<{ entry_id: string; form: string; kind: number }>(
    `SELECT lower(hex(f.entry_id)) AS entry_id, f.form, f.kind
       FROM dictionary_form_fts x JOIN forms f ON f.rowid = x.docid
       WHERE dictionary_form_fts MATCH ? AND f.kind = ${FormKind.romaji}
     UNION ALL
     SELECT lower(hex(f.entry_id)), f.form, f.kind
       FROM shown_romaji_fts x JOIN shown_romaji_forms f ON f.rowid = x.docid
       WHERE shown_romaji_fts MATCH ?`,
    [match, match]
  )
  const result = new Map<string, number[]>()
  let step = 0
  for (const row of rows) {
    stopIfInterrupted(db, step++)
    const relation = romajiRelation(row.form, row.kind, query)
    const relations = result.get(row.entry_id) ?? []
    if (!relations.includes(relation)) relations.push(relation)
    result.set(row.entry_id, relations)
  }
  return result
}
