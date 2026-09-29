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
