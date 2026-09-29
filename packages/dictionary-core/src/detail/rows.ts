/**
 * The rows the detail core reads, as the artifact layer (../artifact) reads them from the app's
 * data and the dictionary service answers with them. Local fixtures hold the same rows, exported
 * by the same code (apps/dictionary-api/scripts/export-fixtures.ts), so the shapes can't drift.
 *
 * Every ID is a lowercase hex Language Reference ID, as the artifact's BLOB IDs read in hex.
 */

/** A written or reading form, as `written_forms_json` and `reading_forms_json` store it. */
export interface FormRow {
  value: string
  kind: 'written' | 'reading'
  /** Presentation labels such as `Rare` or `Search only`. */
  labels: string[]
}

/** A written form or reading a sense is limited to (`sense_form_restrictions`). */
export interface SenseRestrictionRow {
  kind: 'written' | 'reading'
  form: string
}

/** One sense, as `senses_json` stores it, with its restrictions. */
export interface SenseRow {
  meaning: string
  notes: string[]
  partsOfSpeech: string[]
  /** Search uses these (JMdict stagk and stagr); the app doesn't show them. */
  restrictions: SenseRestrictionRow[]
}

/** `pitch_accent_json`: 0 is flat (heiban); otherwise the mora after which pitch falls. */
export interface PitchRow {
  downstep: number
  moraCount: number
  sourceIdentity: string
}

/** A related word from `relationships_json`, with its target resolved to a JMdict number. */
export interface RelationshipRow {
  headword: string
  reading: string
  summary: string
  relation: string
  /** The target entry's `ent_seq`, or null when the relationship names no entry. */
  targetEntSeq: number | null
}

/** A dictionary entry (the `entries` table). */
export interface EntryRow {
  id: string
  /** `source_record_id`: the JMdict entry number in word page URLs (ADR 0007). */
  entSeq: number
  headword: string
  reading: string
  summary: string
  partsOfSpeech: string[]
  writtenForms: FormRow[]
  readingForms: FormRow[]
  senses: SenseRow[]
  relationships: RelationshipRow[]
  /** UniDic's pitch for the entry itself. */
  pitch: PitchRow | null
  /** CompoundPitch's estimate, which the app shows when UniDic has none. */
  compoundPitch: PitchRow | null
}

/**
 * The entry's evidence in one of the website's frequency dictionaries: the app's default packs,
 * JLPT levels and TUBELEX (YouTube). No row means the pack doesn't rank or list the entry.
 */
export type FrequencyRow = { pack: 'jlpt'; level: number } | { pack: 'tubelex'; rank: number }

/**
 * A kanji's KANJIDIC2 meanings, for the word page's Kanji sections, and its readings, which
 * split the headword's furigana kanji by kanji (kanji-split.ts).
 */
export interface KanjiGlossRow {
  character: string
  meanings: string[]
  readings: KanjiReadingRow[]
}

/**
 * A token of an example sentence as Kuromoji reads it, with the app's inflection grouping: the
 * same on every page that shows the sentence.
 */
export interface ExampleSentenceTokenRow {
  /** The token's surface, as the word-detail suite's `surface`. */
  text: string
  /**
   * Kuromoji's reading of the token, in hiragana, when the token has kanji: the furigana the app
   * shows over a word the entry isn't written as (an inflected 見なかった), and the default
   * otherwise. A link's `reading` replaces it on pages where the app shows another.
   */
  reading?: string
  /** Kuromoji's dictionary form, when it differs from the surface: what an ambiguous word searches for. */
  dictionaryForm?: string
}

/**
 * Where a token of an example sentence links on one word's page (`word_examples.links_json`),
 * which depends on the page's entry. It mirrors the word-detail suite's tokens: one `ent_seq` is
 * the suite's `entry`, a token that resolves to one entry; two or more are its `candidates`, a
 * token the app can't resolve to one entry (such as だ). The app records `entry` exactly when a
 * token has one candidate, so the count tells them apart. A token with no dictionary word has no
 * link.
 */
export interface ExampleLinkRow {
  /** The token's index in `ExampleSentenceRow.tokens`. */
  token: number
  entSeqs: number[]
  /**
   * The furigana over a word linked to one entry, when it isn't the token's `reading`: the
   * entry's own reading, which the app shows when the word is written as one of the entry's
   * forms (LinkedTokenView's `displayReading`).
   */
  reading?: string
}

/**
 * An example sentence pair from Tatoeba (`example_sentences`). The Japanese sentence and its
 * English translation are separate Tatoeba sentences, each with its own ID, contributor (null
 * when Tatoeba names none), and license.
 */
export interface ExampleSentenceRow {
  id: number
  /** The artifact's pair ID, lowercase hex. */
  pairId: string
  japanese: string
  english: string
  tokens: ExampleSentenceTokenRow[]
  japaneseTatoebaId: number
  japaneseContributor: string | null
  japaneseLicense: string
  englishTatoebaId: number
  englishContributor: string | null
  englishLicense: string
}

/**
 * One of a word's examples (`word_examples`), in the app's order. `highlights` are the indexes
 * of the tokens that are the page's word (the suite's `pageWord`).
 */
export interface WordExampleRow {
  entSeq: number
  position: number
  sentenceId: number
  highlights: number[]
  links: ExampleLinkRow[]
  /**
   * The sentence's tokens on this page, when the app splits them differently here than
   * everywhere else (a joined word the page's entry is written as stays whole); null otherwise.
   */
  tokens: ExampleSentenceTokenRow[] | null
}

/** One of a word's examples as its page reads it: the sentence, and what this page adds. */
export interface WordExampleRows {
  sentence: ExampleSentenceRow
  example: WordExampleRow
}

/** `word_example_counts`: how many examples a word has, as the app's retrieval reports them. */
export interface ExampleCountRow {
  /** How many examples the page lists, at most 100. */
  listed: number
  /** `ExampleSentenceResultCount`: exact up to 50; 51 means more than 50. */
  count: number
  /** Whether more than 100 matched, so some aren't listed. */
  truncated: boolean
}

/** Everything a word page reads. */
export interface WordRows {
  entry: EntryRow
  frequency: FrequencyRow[]
  /** Meanings for the kanji in the entry's written forms, where KANJIDIC2 has them. */
  kanji: KanjiGlossRow[]
  /** The first examples, in order (the page shows 25 and loads the rest as it scrolls). */
  examples: WordExampleRows[]
  /** Null when the word has no examples. */
  exampleCount: ExampleCountRow | null
}

/** A reading from `KanjiReferenceData.json`. */
export interface KanjiReadingRow {
  value: string
  kind: 'on' | 'kun' | 'name'
}

/** A kanji from `KanjiReferenceData.json` (KANJIDIC2 and KRADFILE). */
export interface KanjiRow {
  character: string
  strokeCount: number
  grade: number | null
  /** KANJIDIC2's JLPT level, which the kanji page shows as the app does (`N` and the level). */
  jlpt: number | null
  meanings: string[]
  readings: KanjiReadingRow[]
  components: string[]
}

/** The kanji's entry in `KanjiElementReferenceData.json`'s `kanji` list. */
export interface KanjiStructureRow {
  onReadings: string[]
  elementGlyphs: string[]
  explicitPhoneticElement: string | null
}

/** An element from `KanjiElementReferenceData.json`'s `elements` list. */
export interface KanjiElementRow {
  glyph: string
  meanings: string[]
  commonLinkedOnReadings: string[]
}

/**
 * An entry in the semantic-fingerprint groups of `kanjiCandidateRowsSQL`: every entry that shares
 * a fingerprint with an entry written with the kanji.
 */
export interface KanjiWordRow {
  id: string
  entSeq: number
  headword: string
  reading: string
  summary: string
  /** `semantic_fingerprint`, lowercase hex. */
  fingerprint: string
  isCommon: boolean
  rankScore: number
  /** Whether one of the entry's written forms contains the kanji. */
  containsKanji: boolean
}

/**
 * One of a kanji page's words, the entry `normalizedEntry` shows for its fingerprint group, in the
 * order `kanjiWords` gives the candidate rows (../artifact/kanji.ts, and the fixtures).
 */
export type KanjiListWordRow = Pick<
  KanjiWordRow,
  'id' | 'entSeq' | 'headword' | 'reading' | 'summary'
>

/** Everything a kanji page reads. */
export interface KanjiRows {
  kanji: KanjiRow
  /** Null when Kanjium has no structure for the kanji. */
  structure: KanjiStructureRow | null
  /** The elements `structure` names. */
  elements: KanjiElementRow[]
  /** The kanji's words (at most 24), in the app's order. */
  words: KanjiListWordRow[]
  /** Its stroke order from KanjiVG; null for the kanji KanjiStrokeData.sqlite3 doesn't draw. */
  strokes: KanjiStrokesRow | null
}

/**
 * A kanji's stroke order (`kanji_strokes`, from KanjiStrokeData.sqlite3's `stroke_diagrams`):
 * each stroke is a compact path, opcode 0 then a point to move to, opcode 1 then three points of
 * a cubic curve, in a square of `viewportSize` (109, KanjiVG's).
 */
export interface KanjiStrokesRow {
  viewportSize: number
  strokeCount: number
  strokes: number[][]
}
