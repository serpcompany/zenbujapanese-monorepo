import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// The search database (SEARCH_DB): one D1 per build of the dictionary, imported by
// scripts/release-d1/ensure-release.sh and read by the search core in src/lib/dictionary/search.
// These are the tables the core queries, a projection of the app's LanguageReferenceData.sqlite3
// (issue 464): IDs are lowercase hex text. The FTS5 tables, which Drizzle can't declare, are in
// the custom migration drizzle/search/0001_fts.sql, and src/db/search-schema.sql records the
// whole resulting schema. The website never writes here at runtime. Never `drizzle-kit push`
// or `pull` this database: they don't know the FTS5 tables.

/**
 * The release this database holds, written last, so its presence marks a complete import.
 * `buildId` hashes everything that shaped the database (scripts/release-d1/build-id.sh): the
 * artifact, these migrations, the import, and the search core that precomputed `search_cache`.
 * `rowCounts` is the local build's count per table, which the deploy checks D1 against.
 */
export const dictionaryImport = sqliteTable('dictionary_import', {
  artifact: text('artifact').notNull(),
  sha256: text('sha256').notNull(),
  transform: text('transform').notNull(),
  buildId: text('build_id').notNull(),
  rowCounts: text('row_counts').notNull()
})

export const entries = sqliteTable('entries', {
  id: text('id').primaryKey(),
  sourceRecordId: integer('source_record_id').notNull(),
  headword: text('headword').notNull(),
  reading: text('reading').notNull(),
  summary: text('summary').notNull(),
  partsOfSpeechJson: text('parts_of_speech_json').notNull(),
  isCommon: integer('is_common').notNull(),
  rankScore: integer('rank_score').notNull(),
  semanticFingerprint: text('semantic_fingerprint').notNull()
})

export const forms = sqliteTable(
  'forms',
  {
    id: integer('id').primaryKey(),
    entryId: text('entry_id').notNull(),
    form: text('form').notNull(),
    kind: integer('kind').notNull()
  },
  table => [index('forms_form_index').on(table.form, table.entryId)]
)

export const formPriorityProfiles = sqliteTable(
  'form_priority_profiles',
  {
    entryId: text('entry_id').notNull(),
    form: text('form').notNull(),
    kind: integer('kind').notNull(),
    primaryMask: integer('primary_mask').notNull(),
    secondaryMask: integer('secondary_mask').notNull(),
    newsFrequencyBand: integer('news_frequency_band')
  },
  table => [primaryKey({ columns: [table.entryId, table.form, table.kind] })]
)

export const canonicalSenses = sqliteTable(
  'canonical_senses',
  {
    entryId: text('entry_id').notNull(),
    senseOrder: integer('sense_order').notNull(),
    partsOfSpeechJson: text('parts_of_speech_json').notNull()
  },
  table => [primaryKey({ columns: [table.entryId, table.senseOrder] })]
)

export const glossAtoms = sqliteTable('gloss_atoms', {
  id: integer('id').primaryKey(),
  entryId: text('entry_id').notNull(),
  senseOrder: integer('sense_order').notNull(),
  glossOrder: integer('gloss_order').notNull(),
  text: text('text').notNull(),
  normalizedText: text('normalized_text').notNull()
})

export const senseFormRestrictions = sqliteTable(
  'sense_form_restrictions',
  {
    entryId: text('entry_id').notNull(),
    senseOrder: integer('sense_order').notNull(),
    kind: integer('kind').notNull(),
    form: text('form').notNull()
  },
  table => [primaryKey({ columns: [table.entryId, table.senseOrder, table.kind, table.form] })]
)

export const readingFormRestrictions = sqliteTable(
  'reading_form_restrictions',
  {
    entryId: text('entry_id').notNull(),
    reading: text('reading').notNull(),
    writtenForm: text('written_form').notNull()
  },
  table => [primaryKey({ columns: [table.entryId, table.reading, table.writtenForm] })]
)

/**
 * Precomputed results for broad queries, keyed by normalized query: the search core's result
 * for each query that reads more than 20,000 rows (scripts/release-d1/search/precompute.mts).
 */
export const searchCache = sqliteTable('search_cache', {
  query: text('query').primaryKey(),
  results: text('results').notNull()
})

/**
 * Each entry's evidence in the website's frequency dictionaries, the app's default packs in
 * catalog order (JLPT levels, then TUBELEX ranks), as JSON `FrequencyRow`s
 * (src/lib/dictionary/detail/rows.ts). Only entries a pack ranks or lists have a row. Search
 * results read it to re-sort equally strong matches and to draw their chips, as SearchView.swift's
 * `SearchResultFrequencyOrdering` and `SearchFrequencyRankPresentationModel` do, so the search
 * database alone decides the results page and its import gate checks all of it.
 */
export const entryFrequency = sqliteTable('entry_frequency', {
  entryId: text('entry_id').primaryKey(),
  frequencyJson: text('frequency_json').notNull()
})

/**
 * Every Tatoeba pair the app's example search reads (#511), numbered from 1 in pair ID order,
 * with each side's attribution. `wordsJson` holds its words as the app links them with no page's
 * entry (`ExampleWordRow`s), so the Example Sentences page links them for its query's entry.
 * The FTS5 indexes that find a search's candidates, example_english_fts and
 * example_japanese_chars, are in the custom migration drizzle/search/0004_example_fts.sql.
 */
export const exampleSentences = sqliteTable('example_sentences', {
  id: integer('id').primaryKey(),
  pairId: text('pair_id').notNull(),
  japanese: text('japanese').notNull(),
  english: text('english').notNull(),
  wordsJson: text('words_json').notNull(),
  japaneseTatoebaId: integer('japanese_tatoeba_id').notNull(),
  japaneseContributor: text('japanese_contributor'),
  japaneseLicense: text('japanese_license').notNull(),
  englishTatoebaId: integer('english_tatoeba_id').notNull(),
  englishContributor: text('english_contributor'),
  englishLicense: text('english_license').notNull()
})

/**
 * Every entry, with what example search needs of it: its written and reading forms as the app's
 * entry holds them (not normalized, unlike `forms`), which link a sentence's words to the entry,
 * and its examples as its word page lists them (`example_sentences` IDs in the app's order, at
 * most 100; null without any), which a deinflected or romaji search opens.
 */
export const exampleEntries = sqliteTable('example_entries', {
  entryId: text('entry_id').primaryKey(),
  entSeq: integer('ent_seq').notNull(),
  writtenFormsJson: text('written_forms_json').notNull(),
  readingFormsJson: text('reading_forms_json').notNull(),
  sentenceIdsJson: text('sentence_ids_json')
})

/**
 * Precomputed example searches: every search with more candidates than the website reads per
 * request (`exampleCandidateLimit`) that can list anything, keyed by `exampleSearchKey`, with the
 * count the row shows and the listed `example_sentences` IDs.
 */
export const exampleSearchCache = sqliteTable('example_search_cache', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  truncated: integer('truncated').notNull(),
  sentenceIdsJson: text('sentence_ids_json').notNull()
})
