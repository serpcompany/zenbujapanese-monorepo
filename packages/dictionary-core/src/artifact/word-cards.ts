import { type ListRanks, type WordCard, wordCard, wordCardFormat } from '../cards/card'
import { type WordCardSource, wordCardLicense, wordCardSources } from '../cards/sources'
import { isLanguageReferenceId, type WordQuery } from '../cards/word-list'
import { normalizeQuery } from '../search/query'
import type { ArtifactDatabase } from './database'
import type { KanjiData } from './kanji-data'
import { type EntryIdentity, entriesById, readWord } from './words'

interface WordCandidate extends Omit<EntryIdentity, 'id'> {
  languageReferenceID: string
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
  license: typeof wordCardLicense
  sources: readonly WordCardSource[]
  cards: WordCard[]
  ambiguous: AmbiguousWord[]
  unresolved: WordQuery[]
}

function candidatesFor(db: ArtifactDatabase, headword: string, reading: string): EntryIdentity[] {
  return db.all<EntryIdentity>(
    `SELECT DISTINCT lower(hex(e.id)) AS id, e.source_record_id AS entSeq,
       e.headword, e.reading, e.summary
     FROM forms w
     JOIN forms r ON r.entry_id = w.entry_id AND r.kind = 1 AND r.form = ?
     JOIN entries e ON e.id = w.entry_id
     WHERE w.form = ? AND w.kind IN (0, 1)
     ORDER BY e.source_record_id`,
    [normalizeQuery(reading), normalizeQuery(headword)]
  )
}

function pick(candidates: EntryIdentity[], headword: string, reading: string): EntryIdentity[] {
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
  const reported = new Set<string>()
  for (const query of queries) {
    const key = JSON.stringify(query)
    if (reported.has(key)) continue
    reported.add(key)
    if ('languageReferenceID' in query) {
      const entry = known.get(query.languageReferenceID.toLowerCase())
      if (entry) resolved.add(entry.id)
      else unresolved.push(query)
      continue
    }
    const candidates = pick(
      candidatesFor(db, query.headword, query.reading),
      query.headword,
      query.reading
    )
    if (candidates.length === 1) resolved.add(candidates[0].id)
    else if (candidates.length === 0) unresolved.push(query)
    else {
      ambiguous.push({
        query,
        candidates: candidates.map(({ id, ...entry }) => ({ languageReferenceID: id, ...entry }))
      })
    }
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
    license: wordCardLicense,
    sources: wordCardSources,
    cards: readWordCards(db, kanji, languageReferenceIDs),
    ambiguous,
    unresolved
  }
}
