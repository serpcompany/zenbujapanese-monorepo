import { integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type {
  ExampleLinkRow,
  ExampleSentenceTokenRow,
  FormRow,
  FrequencyRow,
  KanjiReadingRow,
  PitchRow,
  RelationshipRow,
  SenseRow
} from '../lib/dictionary/detail/rows'

// The dictionary database (DICTIONARY_DB): one D1 per build of the dictionary, imported by
// `scripts/release-d1/ensure-release.sh dictionary` and read by word and kanji pages (issue 464,
// phase 2). A projection of the app's bundled language data, not a mirror: the import
// precomputes what the pages would otherwise scan for at request time. IDs are lowercase hex
// text, as in the search database; words are looked up by `ent_seq` (ADR 0007).
// src/db/dictionary-schema.sql records the whole schema the migrations build. The website never
// writes here at runtime. It has no FTS tables: search reads the search database.
//
// Columns are named and typed for the rows the detail core reads (src/lib/dictionary/detail/
// rows.ts), so a select fills them directly. Display-only data is JSON; only what a page looks up
// by is a column.

/**
 * The release this database holds, written last, so its presence marks a complete import.
 * `buildId` hashes everything that shaped the database (scripts/release-d1/build-id.sh).
 * `rowCounts` is the local build's count per table, which the deploy checks D1 against, and
 * `sources` maps each input file to its SHA-256.
 */
export const dictionaryImport = sqliteTable('dictionary_import', {
  artifact: text('artifact').notNull(),
  sha256: text('sha256').notNull(),
  transform: text('transform').notNull(),
  buildId: text('build_id').notNull(),
  rowCounts: text('row_counts').notNull(),
  sources: text('sources', { mode: 'json' }).notNull().$type<Record<string, string>>()
})

/**
 * A dictionary entry, keyed by its JMdict entry number (`ent_seq`, the artifact's
 * `source_record_id`), which word page URLs carry. `id` is its Language Reference ID.
 * `pitch` is UniDic's; `compoundPitch` is CompoundPitch's estimate, shown when UniDic has none.
 * `frequency` holds the website's frequency dictionaries only: JLPT and TUBELEX. The kanji page
 * orders its words by `fingerprint` (`semantic_fingerprint`), `isCommon`, and `rankScore`.
 */
export const words = sqliteTable(
  'words',
  {
    entSeq: integer('ent_seq').primaryKey(),
    id: text('id').notNull(),
    slug: text('slug').notNull(),
    headword: text('headword').notNull(),
    reading: text('reading').notNull(),
    summary: text('summary').notNull(),
    partsOfSpeech: text('parts_of_speech_json', { mode: 'json' }).notNull().$type<string[]>(),
    writtenForms: text('written_forms_json', { mode: 'json' }).notNull().$type<FormRow[]>(),
    readingForms: text('reading_forms_json', { mode: 'json' }).notNull().$type<FormRow[]>(),
    senses: text('senses_json', { mode: 'json' }).notNull().$type<SenseRow[]>(),
    relationships: text('relationships_json', { mode: 'json' })
      .notNull()
      .$type<RelationshipRow[]>(),
    pitch: text('pitch_json', { mode: 'json' }).$type<PitchRow>(),
    compoundPitch: text('compound_pitch_json', { mode: 'json' }).$type<PitchRow>(),
    frequency: text('frequency_json', { mode: 'json' }).notNull().$type<FrequencyRow[]>(),
    fingerprint: text('semantic_fingerprint').notNull(),
    isCommon: integer('is_common', { mode: 'boolean' }).notNull(),
    rankScore: integer('rank_score').notNull()
  },
  table => [uniqueIndex('words_id_index').on(table.id)]
)

/**
 * A kanji from KanjiReferenceData.json (KANJIDIC2 and KRADFILE), keyed by the exact character,
 * never Unicode-normalized. `jlpt` is KANJIDIC2's old four-level scale, never shown (#485).
 * `wordEntSeqs` is the kanji page's word list, in the app's order. `indexable` is whether
 * search engines may index its page.
 */
export const kanji = sqliteTable('kanji', {
  character: text('character').primaryKey(),
  strokeCount: integer('stroke_count').notNull(),
  grade: integer('grade'),
  jlpt: integer('jlpt'),
  frequencyRank: integer('frequency_rank'),
  meanings: text('meanings_json', { mode: 'json' }).notNull().$type<string[]>(),
  readings: text('readings_json', { mode: 'json' }).notNull().$type<KanjiReadingRow[]>(),
  components: text('components_json', { mode: 'json' }).notNull().$type<string[]>(),
  wordEntSeqs: text('word_ent_seqs_json', { mode: 'json' }).notNull().$type<number[]>(),
  indexable: integer('indexable', { mode: 'boolean' }).notNull()
})

/** A kanji's stroke order, from KanjiStrokeData.sqlite3 (KanjiVG): one path per stroke. */
export const kanjiStrokes = sqliteTable('kanji_strokes', {
  character: text('character').primaryKey(),
  viewportSize: real('viewport_size').notNull(),
  strokeCount: integer('stroke_count').notNull(),
  strokes: text('strokes_json', { mode: 'json' }).notNull().$type<number[][]>()
})

/**
 * A kanji's structure, from KanjiElementReferenceData.json's `kanji` list (Kanjium). A kanji
 * without one has no row.
 */
export const kanjiElements = sqliteTable('kanji_elements', {
  character: text('character').primaryKey(),
  meanings: text('meanings_json', { mode: 'json' }).notNull().$type<string[]>(),
  onReadings: text('on_readings_json', { mode: 'json' }).notNull().$type<string[]>(),
  frequencyRank: integer('frequency_rank'),
  elementGlyphs: text('element_glyphs_json', { mode: 'json' }).notNull().$type<string[]>(),
  explicitPhoneticElement: text('explicit_phonetic_element')
})

/** An element from KanjiElementReferenceData.json's `elements` list, keyed by its glyph. */
export const elementGlyphs = sqliteTable('element_glyphs', {
  glyph: text('glyph').primaryKey(),
  alternatives: text('alternatives_json', { mode: 'json' }).notNull().$type<string[]>(),
  meanings: text('meanings_json', { mode: 'json' }).notNull().$type<string[]>(),
  onReadings: text('on_readings_json', { mode: 'json' }).notNull().$type<string[]>(),
  commonLinkedOnReadings: text('common_linked_on_readings_json', { mode: 'json' })
    .notNull()
    .$type<string[]>(),
  containingCharacters: text('containing_characters_json', { mode: 'json' })
    .notNull()
    .$type<string[]>()
})

/**
 * An example sentence pair (Tatoeba), with its neutral tokens from the app's Kuromoji build.
 * `id` is the import's own number, which keeps `word_examples` small; `pairId` is the artifact's
 * pair ID. The Japanese sentence and its English translation are separate Tatoeba sentences, so
 * each side has its own attribution, from the artifact's `example_sentence_provenance`
 * (`source_<side>_record_id`, `<side>_contributor`, `<side>_license`). A contributor is null when
 * Tatoeba names none; the licenses can differ (some English sides are CC0).
 */
export const exampleSentences = sqliteTable('example_sentences', {
  id: integer('id').primaryKey(),
  pairId: text('pair_id').notNull(),
  japanese: text('japanese').notNull(),
  english: text('english').notNull(),
  tokens: text('tokens_json', { mode: 'json' }).notNull().$type<ExampleSentenceTokenRow[]>(),
  japaneseTatoebaId: integer('japanese_tatoeba_id').notNull(),
  japaneseContributor: text('japanese_contributor'),
  japaneseLicense: text('japanese_license').notNull(),
  englishTatoebaId: integer('english_tatoeba_id').notNull(),
  englishContributor: text('english_contributor'),
  englishLicense: text('english_license').notNull()
})

/**
 * A word's examples in the app's order (`position` from 0), at most 100 per word as in the app.
 * `highlights` are the indexes of the tokens that are the word; `links` are where each word
 * token links on this word's page, since the entry a token resolves to depends on the page: one
 * `ent_seq` for a resolved token, several for an ambiguous one (rows.ts `ExampleLinkRow`).
 * `tokens` replaces the sentence's tokens on the few pages where the app splits it differently:
 * a joined word such as おせじに stays whole on the page of the entry it's written as (about
 * 30 examples), where elsewhere it falls back to its pieces. It is null everywhere else.
 */
export const wordExamples = sqliteTable(
  'word_examples',
  {
    entSeq: integer('ent_seq').notNull(),
    position: integer('position').notNull(),
    sentenceId: integer('sentence_id').notNull(),
    highlights: text('highlights_json', { mode: 'json' }).notNull().$type<number[]>(),
    links: text('links_json', { mode: 'json' }).notNull().$type<ExampleLinkRow[]>(),
    tokens: text('tokens_json', { mode: 'json' }).$type<ExampleSentenceTokenRow[]>()
  },
  table => [primaryKey({ columns: [table.entSeq, table.position] })]
)

/**
 * How many examples a word has, for each word with any: `listed` rows in word_examples, and the
 * count the app's retrieval reports (`count`, exact up to 50; 51 means more than 50), and
 * whether more than 100 matched (`truncated`), so some aren't listed.
 */
export const wordExampleCounts = sqliteTable('word_example_counts', {
  entSeq: integer('ent_seq').primaryKey(),
  listed: integer('listed').notNull(),
  count: integer('count').notNull(),
  truncated: integer('truncated', { mode: 'boolean' }).notNull()
})

/**
 * `ent_seq`s a previous release published and this one doesn't, with the entry that replaces
 * each, if any, so their word pages can redirect or return 410.
 */
export const retiredIds = sqliteTable('retired_ids', {
  entSeq: integer('ent_seq').primaryKey(),
  replacementEntSeq: integer('replacement_ent_seq')
})

/**
 * The word sitemaps, `/sitemaps/dictionary/<number>.xml`: each lists the words from
 * `firstEntSeq` to `lastEntSeq`, at most 50,000 (`urlCount`), so a sitemap reads only its own
 * range of `words`, and the sitemap index only this table. The import precomputes it.
 */
export const wordSitemaps = sqliteTable('word_sitemaps', {
  number: integer('number').primaryKey(),
  firstEntSeq: integer('first_ent_seq').notNull(),
  lastEntSeq: integer('last_ent_seq').notNull(),
  urlCount: integer('url_count').notNull()
})
