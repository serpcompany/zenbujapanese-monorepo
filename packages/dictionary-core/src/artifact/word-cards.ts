import { type ListRanks, type WordCard, wordCard, wordCardFormat } from '../cards/card'
import { type WordCardSource, wordCardSources } from '../cards/sources'
import { isLanguageReferenceId, type WordQuery } from '../cards/word-list'
import { normalizeQuery } from '../search/query'
import type { ArtifactDatabase } from './database'
import type { KanjiData } from './kanji-data'
import { readWord } from './words'

interface WordCandidate {
  languageReferenceID: string
  entSeq: number
  headword: string
  reading: string
  summary: string
}

interface AmbiguousWord {
  query: WordQuery
  candidates: WordCandidate[]
}

export interface ResolvedWords {
  languageReferenceIDs: string[]
  ambiguous: AmbiguousWord[]
  unresolved: WordQuery[]
}

export interface LanguageDataVersion {
  release: string
  file: string
  sha256: string
}

export interface WordCardExport {
  format: typeof wordCardFormat
  languageData: LanguageDataVersion
  sources: readonly WordCardSource[]
  cards: WordCard[]
  ambiguous: AmbiguousWord[]
  unresolved: WordQuery[]
}

function entriesById(db: ArtifactDatabase, ids: readonly string[]): Map<string, WordCandidate> {
  const rows = db.all<WordCandidate>(
    `SELECT lower(hex(id)) AS languageReferenceID, source_record_id AS entSeq, headword, reading,
       summary FROM entries WHERE id IN (SELECT unhex(value) FROM json_each(?))`,
    [JSON.stringify(ids)]
  )
  return new Map(rows.map(row => [row.languageReferenceID, row]))
}

function candidatesFor(db: ArtifactDatabase, headword: string, reading: string): WordCandidate[] {
  return db.all<WordCandidate>(
    `SELECT DISTINCT lower(hex(e.id)) AS languageReferenceID, e.source_record_id AS entSeq,
       e.headword, e.reading, e.summary
     FROM forms w
     JOIN forms r ON r.entry_id = w.entry_id AND r.kind = 1 AND r.form = ?
     JOIN entries e ON e.id = w.entry_id
     WHERE w.form = ? AND w.kind IN (0, 1)
     ORDER BY e.source_record_id`,
    [normalizeQuery(reading), normalizeQuery(headword)]
  )
}

function pick(candidates: WordCandidate[], headword: string, reading: string): WordCandidate[] {
  const exact = candidates.filter(
    candidate => candidate.headword === headword && candidate.reading === reading
  )
  return exact.length > 0 ? exact : candidates
}

export function resolveWords(db: ArtifactDatabase, queries: readonly WordQuery[]): ResolvedWords {
  const named = queries.flatMap(query =>
    'languageReferenceID' in query ? [query.languageReferenceID.toLowerCase()] : []
  )
  const known = entriesById(db, named.filter(isLanguageReferenceId))
  const resolved = new Set<string>()
  const ambiguous: AmbiguousWord[] = []
  const unresolved: WordQuery[] = []
  for (const query of queries) {
    if ('languageReferenceID' in query) {
      const entry = known.get(query.languageReferenceID.toLowerCase())
      if (entry) resolved.add(entry.languageReferenceID)
      else unresolved.push(query)
      continue
    }
    const candidates = pick(
      candidatesFor(db, query.headword, query.reading),
      query.headword,
      query.reading
    )
    if (candidates.length === 1) resolved.add(candidates[0].languageReferenceID)
    else if (candidates.length === 0) unresolved.push(query)
    else ambiguous.push({ query, candidates })
  }
  return { languageReferenceIDs: [...resolved], ambiguous, unresolved }
}

function listRanks(db: ArtifactDatabase, ids: readonly string[]): Map<string, Map<string, number>> {
  const ranks = new Map<string, Map<string, number>>()
  for (const { id, packId, rank } of db.all<{ id: string; packId: string; rank: number }>(
    `SELECT lower(hex(r.language_reference_id)) AS id, l.pack_id AS packId, min(r.rank) AS rank
     FROM ranked.ranked_evidence r JOIN ranked.ranked_lists l ON l.list_id = r.list_id
     WHERE r.language_reference_id IN (SELECT unhex(value) FROM json_each(?))
     GROUP BY r.language_reference_id, l.pack_id`,
    [JSON.stringify(ids)]
  )) {
    const entry = ranks.get(id) ?? new Map<string, number>()
    entry.set(packId, rank)
    ranks.set(id, entry)
  }
  return ranks
}

const noRanks: ListRanks = new Map()

export function readWordCards(
  db: ArtifactDatabase,
  kanji: KanjiData,
  languageReferenceIDs: readonly string[]
): WordCard[] {
  const ids = [...new Set(languageReferenceIDs.map(id => id.toLowerCase()))].filter(
    isLanguageReferenceId
  )
  const entries = entriesById(db, ids)
  const ranks = listRanks(db, ids)
  return ids.flatMap(id => {
    const entry = entries.get(id)
    const rows = entry ? readWord(db, kanji, entry.entSeq) : null
    return rows ? [wordCard(rows, ranks.get(id) ?? noRanks)] : []
  })
}

export function exportWordCards(
  db: ArtifactDatabase,
  kanji: KanjiData,
  languageData: LanguageDataVersion,
  queries: readonly WordQuery[]
): WordCardExport {
  const { languageReferenceIDs, ambiguous, unresolved } = resolveWords(db, queries)
  return {
    format: wordCardFormat,
    languageData,
    sources: wordCardSources,
    cards: readWordCards(db, kanji, languageReferenceIDs),
    ambiguous,
    unresolved
  }
}
