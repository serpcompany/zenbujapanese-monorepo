// Ports the retrieval in apps/ios/Modules/Sources/SearchExperience/LookupClient.swift and the
// result composition in DictionaryEntry.swift. Results come back in dictionary order, before
// frequency evidence reorders them, exactly as the conformance suite pins them (ADR 0006).
// Change the Swift search and this port in the same PR (issue 481, ADR 0008).
import { acceptsPartsOfSpeech, deinflect } from './deinflect'
import { fts4Phrase, fts4Prefix, fts5Phrase } from './fts'
import { lookupSegments, type MorphologyAnalyzer, type MorphologyWord } from './morphology'
import {
  compareStrings,
  graphemes,
  isASCII,
  isJapaneseOnly,
  isMixedScript,
  japaneseSegments,
  literalQuery,
  normalizeQuery,
  romajiDeinflectedCandidates
} from './query'
import {
  compareEnglishRanks,
  compareJapaneseRanks,
  comparePresentationRanks,
  compareProfiles,
  type EnglishRank,
  EvidenceLane,
  FormRelation,
  GlossRelation,
  isMarked,
  type JapaneseRank,
  type PriorityProfile,
  type Rank,
  RomajiRelation,
  sameLexicalGroup
} from './rank'

export type { MorphologyAnalyzer, MorphologyWord } from './morphology'

/**
 * The only database access Search needs, so it runs on D1 or any SQLite. Parameters bind to
 * anonymous `?` placeholders in the order they appear.
 */
export interface SearchDatabase {
  all<Row>(sql: string, params: readonly (string | number)[]): Promise<Row[]>
}

export function d1SearchDatabase(db: D1Database): SearchDatabase {
  return {
    async all<Row>(sql: string, params: readonly (string | number)[]) {
      const { results } = await db
        .prepare(sql)
        .bind(...params)
        .all<Row>()
      return results
    }
  }
}

/**
 * Capabilities a client supplies. A feature whose capability is missing is off and the rest of
 * Search is unchanged, so a client that can't run one leaves it out (ADR 0008).
 */
export interface SearchCapabilities {
  /**
   * Sentence search: listing the words of a Japanese phrase that isn't one dictionary word, as
   * the app's Discovered Words. The app's analyzer, Sudachi, needs a 217 MB dictionary.
   */
  morphology?: MorphologyAnalyzer
}

/** The features a client's capabilities turn on. */
export interface SearchFeatures {
  sentenceSearch: boolean
}

export function searchFeatures(capabilities: SearchCapabilities): SearchFeatures {
  return { sentenceSearch: capabilities.morphology !== undefined }
}

export interface SearchEntry {
  id: string
  sourceRecordId: number
  headword: string
  reading: string
  summary: string
  partsOfSpeech: string[]
}

export interface SearchResultItem {
  entry: SearchEntry
  sourceOrder: number
  matchRank: Rank
  fallbackOrder: number
  /** The English meaning that matched, when an English query matched a gloss. */
  matchedSummary: string | null
}

export interface SearchResults {
  items: SearchResultItem[]
  leadingLexicalEntryCount: number
  presentation: 'ranked' | 'discoveredWords'
  resolution: 'direct' | 'deinflected' | 'analyzed'
  readingRefinement: string | null
  usesPrimaryEntryExamples: boolean
  hasExactOrPrefixMatch: boolean
}

const resultLimit = 60
/** D1 binds at most 100 parameters per query. */
const maximumParameters = 100
const FormKind = { written: 0, reading: 1, romaji: 2 } as const

/** New empty results each time, so a caller that changes them can't affect later searches. */
function noResults(): SearchResults {
  return {
    items: [],
    leadingLexicalEntryCount: 0,
    presentation: 'ranked',
    resolution: 'direct',
    readingRefinement: null,
    usesPrimaryEntryExamples: false,
    hasExactOrPrefixMatch: false
  }
}

interface RankedEntry {
  entry: SearchEntry
  /** Orders entries and sets the leading lexical group (the app's legacy rank). */
  rank: Rank
  /** The coarse rank shown with each result; after merging, the group's strongest. */
  presentationRank: Rank
  hasExactOrPrefixMatch: boolean
  semanticFingerprint: string
  matchedSummary: string | null
}

interface EntryRow {
  id: string
  source_record_id: number
  headword: string
  reading: string
  summary: string
  parts_of_speech_json: string
  semantic_fingerprint: string
  primary_mask: number | null
  secondary_mask: number | null
  news_frequency_band: number | null
}

interface JapaneseRow extends EntryRow {
  form: string
  kind: number
  sense_count: number
}

const entryColumns = `e.id, e.source_record_id, e.headword, e.reading, e.summary,
  e.parts_of_speech_json, e.semantic_fingerprint`

const displayedFormProfileJoin = `LEFT JOIN form_priority_profiles p
  ON p.entry_id = e.id AND p.form = e.headword
  AND p.kind = CASE WHEN e.headword = e.reading THEN ${FormKind.reading} ELSE ${FormKind.written} END`

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

/**
 * The forms that contain `query`, as the app's `instr(form, ?)` scan over every form finds them.
 * form_chars narrows the scan to forms with the query's characters, and instr() keeps the app's
 * exact semantics. Null when no form can contain the query: scripts/search-d1/build-rows.py
 * checks that form_chars indexes every character in a form, so a query of only other
 * characters, such as a zero-width space, can't be in one.
 */
function containsFilter(query: string): { sql: string; params: string[] } | null {
  const characters = Array.from(query).filter(character =>
    /[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Co}]/u.test(character)
  )
  if (characters.length === 0) return null
  return {
    sql: 'f.id IN (SELECT rowid FROM form_chars WHERE form_chars MATCH ?) AND instr(f.form, ?) > 0',
    params: [fts5Phrase(characters.join(' ')), query]
  }
}

function decodeEntry(row: EntryRow): SearchEntry {
  return {
    id: row.id,
    sourceRecordId: row.source_record_id,
    headword: row.headword,
    reading: row.reading,
    summary: row.summary,
    partsOfSpeech: JSON.parse(row.parts_of_speech_json)
  }
}

function profile(row: EntryRow): PriorityProfile {
  return {
    primaryMask: row.primary_mask ?? 0,
    secondaryMask: row.secondary_mask ?? 0,
    newsFrequencyBand: row.news_frequency_band
  }
}

const hasSearchTerms = (value: string) => /[\p{L}\p{M}\p{N}]/u.test(value)
const escapeRegExp = (value: string) => value.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&')

function glossRelation(query: string, gloss: string, token: RegExp): number | null {
  const value = normalizeQuery(gloss)
  if (value === query) return GlossRelation.exactGloss
  if (value.startsWith(`${query} (`)) return GlossRelation.qualifiedGloss
  if (value === `to ${query}`) return GlossRelation.exactInfinitive
  if (value.startsWith(`to ${query} (`)) return GlossRelation.qualifiedInfinitive
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

/** Swift's `min(by:)`: the first element nothing precedes. */
function minimum<Value>(values: Value[], compare: (lhs: Value, rhs: Value) => number) {
  let best: Value | undefined
  for (const value of values) {
    if (best === undefined || compare(value, best) < 0) best = value
  }
  return best
}

/**
 * Collapses entries that share a semantic fingerprint into the lowest Language Reference ID. The
 * JMdict entry number comes from the entry that owns that ID, so the ID and the number always
 * name the same entry, whatever the query or row order.
 */
function deduplicated(ranked: RankedEntry[]): RankedEntry[] {
  const groups = new Map<string, RankedEntry[]>()
  for (const entry of ranked) {
    const group = groups.get(entry.semanticFingerprint)
    if (group) group.push(entry)
    else groups.set(entry.semanticFingerprint, [entry])
  }
  return [...groups.values()].map(group => {
    const leading = group[0]
    const strongest = minimum(group, (lhs, rhs) =>
      comparePresentationRanks(lhs.presentationRank, rhs.presentationRank)
    )
    const canonical =
      minimum(group, (lhs, rhs) => compareStrings(lhs.entry.id, rhs.entry.id)) ?? leading
    return {
      entry: {
        ...leading.entry,
        id: canonical.entry.id,
        sourceRecordId: canonical.entry.sourceRecordId
      },
      rank: leading.rank,
      hasExactOrPrefixMatch: group.some(ranked => ranked.hasExactOrPrefixMatch),
      semanticFingerprint: leading.semanticFingerprint,
      presentationRank: strongest?.presentationRank ?? leading.presentationRank,
      matchedSummary: strongest?.matchedSummary ?? null
    }
  })
}

/** Ranks the Japanese form rows that matched `query`, one result per entry. */
function rankJapanese(query: string, rows: JapaneseRow[]): RankedEntry[] {
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
      headwordLength: graphemes(entry.headword).length,
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

function resultItems(ranked: RankedEntry[]): SearchResultItem[] {
  return ranked.map((entry, fallbackOrder) => ({
    entry: entry.entry,
    sourceOrder: 0,
    matchRank: entry.presentationRank,
    fallbackOrder,
    matchedSummary: entry.matchedSummary
  }))
}

function composing(
  sources: SearchResultItem[][],
  options: {
    leadingLexicalEntryCount: number
    usesPrimaryEntryExamples: boolean
    hasExactOrPrefixMatch?: boolean
    resolution?: SearchResults['resolution']
    limit?: number
  }
): SearchResults {
  const limit = options.limit ?? resultLimit
  const items: SearchResultItem[] = []
  const seen = new Set<string>()
  compose: for (const [sourceOrder, source] of sources.entries()) {
    for (const item of source) {
      if (seen.has(item.entry.id)) continue
      seen.add(item.entry.id)
      items.push({ ...item, sourceOrder, fallbackOrder: items.length })
      if (items.length === limit) break compose
    }
  }
  return {
    ...noResults(),
    items,
    leadingLexicalEntryCount: Math.min(options.leadingLexicalEntryCount, items.length),
    resolution: options.resolution ?? 'direct',
    usesPrimaryEntryExamples: options.usesPrimaryEntryExamples,
    hasExactOrPrefixMatch: options.hasExactOrPrefixMatch ?? true
  }
}

export class DictionarySearch {
  readonly features: SearchFeatures

  constructor(
    private readonly db: SearchDatabase,
    private readonly capabilities: SearchCapabilities = {}
  ) {
    this.features = searchFeatures(capabilities)
  }

  /** Search the dictionary for a Japanese, kana, romaji, or English query. */
  async search(rawQuery: string): Promise<SearchResults> {
    const query = normalizeQuery(rawQuery)
    const exactFormEntry =
      isASCII(query) && query !== '' ? (await this.rankedEnglish(query, true))[0]?.entry : undefined
    if (exactFormEntry) {
      const refinement = normalizeQuery(exactFormEntry.reading)
      const [hasRefinedResults, literalResults] = await Promise.all([
        this.hasResults(refinement),
        this.searchOnce(literalQuery(query))
      ])
      if (hasRefinedResults && literalResults.items.length > 0) {
        const usesPrimaryEntryExamples =
          literalResults.usesPrimaryEntryExamples ||
          literalResults.items.some(item => item.entry.id === exactFormEntry.id)
        return { ...literalResults, usesPrimaryEntryExamples, readingRefinement: refinement }
      }
    }

    const directResults = await this.searchOnce(query)
    const romajiCandidates = romajiDeinflectedCandidates(query)
    if (!directResults.hasExactOrPrefixMatch && romajiCandidates.length > 0) {
      const deinflectedResults = await Promise.all(
        romajiCandidates.map(candidate => this.searchOnce(candidate))
      )
      const primaryIndex = deinflectedResults.findIndex(results => results.items.length > 0)
      if (primaryIndex >= 0) {
        const primary = deinflectedResults[primaryIndex]
        const primaryItems = primary.items.slice(0, primary.leadingLexicalEntryCount)
        return composing(
          [
            primaryItems,
            ...deinflectedResults.slice(primaryIndex + 1).map(results => results.items),
            directResults.items
          ],
          {
            leadingLexicalEntryCount: primaryItems.length,
            usesPrimaryEntryExamples: true,
            resolution: 'deinflected'
          }
        )
      }
    }

    if (isJapaneseOnly(query)) {
      const deinflectedSources = await this.japaneseDeinflectedSources(query)
      if (deinflectedSources.length > 0) {
        // An exact dictionary form stays first (した is 下 and 舌 before する); the
        // deinflected lemmas follow it ahead of prefix and contains matches.
        let exactCount = 0
        for (const item of directResults.items) {
          if (item.matchRank.kind !== 'japanese') break
          if (item.matchRank.relation > FormRelation.readingExact) break
          exactCount++
        }
        if (exactCount > 0) {
          return composing(
            [
              directResults.items.slice(0, exactCount),
              ...deinflectedSources,
              directResults.items.slice(exactCount)
            ],
            {
              leadingLexicalEntryCount: directResults.leadingLexicalEntryCount,
              usesPrimaryEntryExamples: directResults.usesPrimaryEntryExamples,
              hasExactOrPrefixMatch: directResults.hasExactOrPrefixMatch
            }
          )
        }
        return composing([...deinflectedSources, directResults.items], {
          leadingLexicalEntryCount: deinflectedSources[0].length,
          usesPrimaryEntryExamples: true,
          resolution: 'deinflected'
        })
      }
    }

    if (exactFormEntry && directResults.items.some(item => item.entry.id === exactFormEntry.id)) {
      return { ...directResults, usesPrimaryEntryExamples: true }
    }
    if (directResults.items.length > 0) return directResults

    // Sentence search: the app splits the query with its Japanese text analyzer and lists an
    // entry for each word. Without that capability it finds nothing here, as in the app when
    // its analyzer is unavailable, and the mixed-script segments below still apply.
    const analyzed = await this.analyzedItems(query)
    if (analyzed.length > 1 || (isMixedScript(query) && analyzed.length > 0)) {
      return {
        ...composing(
          analyzed.map(item => [item]),
          {
            leadingLexicalEntryCount: analyzed.length,
            usesPrimaryEntryExamples: false,
            hasExactOrPrefixMatch: false,
            resolution: 'analyzed',
            limit: analyzed.length
          }
        ),
        presentation: 'discoveredWords'
      }
    }
    if (isMixedScript(query)) {
      for (const segment of japaneseSegments(query)) {
        const results = await this.searchOnce(segment)
        if (results.items.length > 0) {
          return { ...results, presentation: 'discoveredWords', hasExactOrPrefixMatch: false }
        }
      }
    }
    return noResults()
  }

  /**
   * The app binds text as C strings (`sqlite3_bind_text` with length -1), so SQLite reads each
   * up to its first NUL. Binding the same way keeps a query that contains one in step with it.
   */
  private all<Row>(sql: string, params: readonly (string | number)[]): Promise<Row[]> {
    return this.db.all<Row>(
      sql,
      params.map(param => (typeof param === 'string' ? param.split('\0', 1)[0] : param))
    )
  }

  private async searchOnce(query: string): Promise<SearchResults> {
    if (query === '') return noResults()
    const ranked = isASCII(query)
      ? await this.rankedEnglish(query)
      : await this.rankedJapanese(query)
    if (ranked.length === 0) return noResults()
    let leadingLexicalEntryCount = 0
    while (
      leadingLexicalEntryCount < ranked.length &&
      sameLexicalGroup(ranked[leadingLexicalEntryCount].rank, ranked[0].rank)
    ) {
      leadingLexicalEntryCount++
    }
    return {
      ...noResults(),
      items: resultItems(ranked.slice(0, resultLimit)),
      leadingLexicalEntryCount: Math.min(leadingLexicalEntryCount, resultLimit),
      hasExactOrPrefixMatch: ranked.some(entry => entry.hasExactOrPrefixMatch)
    }
  }

  /** Whether `searchOnce(query)` finds anything, without ranking every match. */
  private async hasResults(query: string): Promise<boolean> {
    if (query === '') return false
    if (isASCII(query)) return (await this.searchOnce(query)).items.length > 0
    const filter = containsFilter(query)
    if (!filter) return false
    const rows = await this.all(
      `SELECT 1 FROM forms f JOIN entries e ON e.id = f.entry_id
       WHERE f.kind IN (${FormKind.written}, ${FormKind.reading})
         AND ${filter.sql}
         AND ${readingRestrictionFilter}
       LIMIT 1`,
      filter.params
    )
    return rows.length > 0
  }

  /** The entry for each word the analyzer finds: the one written as that word, else the first. */
  private async analyzedItems(query: string): Promise<SearchResultItem[]> {
    const morphology = this.capabilities.morphology
    if (!morphology || query === '') return []
    let words: MorphologyWord[]
    try {
      words = await morphology.analyze(query)
    } catch {
      return [] // The app treats an analysis that fails as finding no words.
    }
    const segments = lookupSegments(words)
    const results = await Promise.all(segments.map(segment => this.searchOnce(segment)))
    return results.flatMap(({ items }, index) => {
      const item = items.find(candidate => candidate.entry.headword === segments[index]) ?? items[0]
      return item ? [item] : []
    })
  }

  /** Dictionary entries for kana and kanji inflections, grouped by deinflection chain length. */
  private async japaneseDeinflectedSources(query: string): Promise<SearchResultItem[][]> {
    const candidates = deinflect(query).map(candidate => ({
      ...candidate,
      term: normalizeQuery(candidate.term)
    }))
    const matchesByTerm = await this.rankedJapaneseForms(
      candidates.map(candidate => candidate.term)
    )
    const sourcesByDepth = new Map<number, RankedEntry[]>()
    const seen = new Set<string>()
    for (const candidate of candidates) {
      const matches = (matchesByTerm.get(candidate.term) ?? []).filter(ranked =>
        candidate.wordClasses.some(wordClass =>
          acceptsPartsOfSpeech(wordClass, ranked.entry.partsOfSpeech)
        )
      )
      for (const match of matches) {
        if (seen.has(match.entry.id)) continue
        seen.add(match.entry.id)
        const source = sourcesByDepth.get(candidate.depth) ?? []
        source.push(match)
        sourcesByDepth.set(candidate.depth, source)
      }
    }
    return [...sourcesByDepth.keys()]
      .sort((lhs, rhs) => lhs - rhs)
      .map(depth => resultItems(sourcesByDepth.get(depth) ?? []))
  }

  private async rankedJapanese(query: string): Promise<RankedEntry[]> {
    const filter = containsFilter(query)
    return filter ? rankJapanese(query, await this.japaneseRows(filter.sql, filter.params)) : []
  }

  /** Entries with a form equal to each term, looked up together rather than one term at a time. */
  private async rankedJapaneseForms(terms: string[]): Promise<Map<string, RankedEntry[]>> {
    const distinct = [...new Set(terms)].filter(term => term !== '')
    const batches: string[][] = []
    for (let start = 0; start < distinct.length; start += maximumParameters) {
      batches.push(distinct.slice(start, start + maximumParameters))
    }
    const rowsByTerm = new Map<string, JapaneseRow[]>()
    const rows = await Promise.all(
      batches.map(batch =>
        this.japaneseRows(`f.form IN (${batch.map(() => '?').join(', ')})`, batch)
      )
    )
    for (const row of rows.flat()) {
      const termRows = rowsByTerm.get(row.form) ?? []
      termRows.push(row)
      rowsByTerm.set(row.form, termRows)
    }
    return new Map(distinct.map(term => [term, rankJapanese(term, rowsByTerm.get(term) ?? [])]))
  }

  private japaneseRows(where: string, params: readonly string[]): Promise<JapaneseRow[]> {
    return this.all<JapaneseRow>(
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

  private async rankedEnglish(query: string, exactFormOnly = false): Promise<RankedEntry[]> {
    const evidence = exactFormOnly
      ? await this.exactRomajiEvidence(query)
      : await this.englishEvidence(query)
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
        headwordLength: graphemes(entry.headword).length,
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
          relation: GlossRelation.glossToken,
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
        relation: selectedGloss.relation,
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

  /** Entries with a romaji form equal to `query`, the only evidence exact lookups use. */
  private async exactRomajiEvidence(query: string) {
    const rows = await this.all<EntryRow>(
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

  /** Entries whose English meanings or romaji forms match `query`, with that evidence. */
  private async englishEvidence(query: string) {
    if (!hasSearchTerms(query)) return null
    const glossMatch = fts4Phrase(query)
    const romajiMatch = fts4Prefix(query)
    const candidates: string[] = []
    const params: string[] = []
    if (glossMatch !== null) {
      candidates.push(
        'SELECT g.entry_id FROM gloss_fts x JOIN gloss_atoms g ON g.id = x.rowid WHERE gloss_fts MATCH ?'
      )
      params.push(glossMatch)
    }
    if (romajiMatch !== null) {
      candidates.push(
        `SELECT f.entry_id FROM romaji_fts x JOIN forms f ON f.id = x.rowid
         WHERE romaji_fts MATCH ? AND f.kind = ${FormKind.romaji}`
      )
      params.push(romajiMatch)
    }
    if (candidates.length === 0) return null
    const [rows, glossMatches, romajiMatches] = await Promise.all([
      this.all<EntryRow>(
        `WITH candidates AS (${candidates.join(' UNION ')})
         SELECT ${entryColumns}, p.primary_mask, p.secondary_mask, p.news_frequency_band
         FROM candidates c JOIN entries e ON e.id = c.entry_id ${displayedFormProfileJoin}`,
        params
      ),
      glossMatch === null
        ? new Map<string, GlossEvidence[]>()
        : this.glossEvidence(query, glossMatch),
      romajiMatch === null ? new Map<string, number[]>() : this.romajiEvidence(query, romajiMatch)
    ])
    return { rows, glossMatches, romajiMatches }
  }

  private async glossEvidence(query: string, match: string): Promise<Map<string, GlossEvidence[]>> {
    // A sense restricted to some written forms or readings applies only when the entry is shown
    // with one of them.
    const rows = await this.all<{
      entry_id: string
      sense_order: number
      gloss_order: number
      text: string
      headword: string
      reading: string
      written_forms: string
      readings: string
    }>(
      `SELECT g.entry_id, g.sense_order, g.gloss_order, g.text, e.headword, e.reading,
         (SELECT json_group_array(r.form) FROM sense_form_restrictions r
          WHERE r.entry_id = g.entry_id AND r.sense_order = g.sense_order
            AND r.kind = ${FormKind.written}) AS written_forms,
         (SELECT json_group_array(r.form) FROM sense_form_restrictions r
          WHERE r.entry_id = g.entry_id AND r.sense_order = g.sense_order
            AND r.kind = ${FormKind.reading}) AS readings
       FROM gloss_fts x
       JOIN gloss_atoms g ON g.id = x.rowid
       JOIN canonical_senses s ON s.entry_id = g.entry_id AND s.sense_order = g.sense_order
       JOIN entries e ON e.id = g.entry_id
       WHERE gloss_fts MATCH ?`,
      [match]
    )
    const token = new RegExp(`(?:^|[^a-z])${escapeRegExp(query)}(?:$|[^a-z])`, 'u')
    const result = new Map<string, GlossEvidence[]>()
    for (const row of rows) {
      const writtenForms: string[] = JSON.parse(row.written_forms)
      const readings: string[] = JSON.parse(row.readings)
      if (writtenForms.length > 0 && !writtenForms.includes(normalizeQuery(row.headword))) continue
      if (readings.length > 0 && !readings.includes(normalizeQuery(row.reading))) continue
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

  private async romajiEvidence(query: string, match: string): Promise<Map<string, number[]>> {
    const rows = await this.all<{ entry_id: string; form: string }>(
      `SELECT f.entry_id, f.form FROM romaji_fts x JOIN forms f ON f.id = x.rowid
       WHERE romaji_fts MATCH ? AND f.kind = ${FormKind.romaji}`,
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
}
