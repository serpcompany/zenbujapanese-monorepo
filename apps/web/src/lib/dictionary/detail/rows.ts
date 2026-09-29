/**
 * The rows the detail core reads, shaped like the planned dictionary D1 (#464 phase 2, #465).
 * Local fixtures hold the same rows, exported from the app's bundled data by
 * scripts/export-dictionary-fixtures.py, so the shapes can't drift from the app's.
 *
 * Every ID is a lowercase hex Language Reference ID, as in the search database.
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

/** A kanji's KANJIDIC2 meanings, for the word page's Kanji sections. */
export interface KanjiGlossRow {
  character: string
  meanings: string[]
}

/** A token of an example sentence. Until the example pipeline (#465 PR 6), fixtures only. */
export interface ExampleTokenRow {
  text: string
  /** The token's full reading; furigana is placed over its kanji only. */
  reading?: string
  /** A dictionary word the learner can look up, drawn with an underline. */
  isWord?: boolean
  /** Part of the entry the example illustrates. */
  isMatch?: boolean
}

export interface ExampleRow {
  tokens: ExampleTokenRow[]
  translation: string
}

/**
 * A token of an example sentence as the dictionary database stores it
 * (`example_sentences.tokens_json`): the same on every word page that shows the sentence.
 */
export interface ExampleSentenceTokenRow {
  /** The token's surface, as the word-detail suite's `surface`. */
  text: string
  /** The token's full reading, when it has one. */
  reading?: string
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
}

/** Everything a word page reads. */
export interface WordRows {
  entry: EntryRow
  frequency: FrequencyRow[]
  /** Meanings for the kanji in the entry's written forms, where KANJIDIC2 has them. */
  kanji: KanjiGlossRow[]
  examples: ExampleRow[]
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
  /** KANJIDIC2's pre-2010 four-level scale, not an N-level; never shown (#485). */
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
 * One of a kanji page's words, the entry `normalizedEntry` shows for its fingerprint group. The
 * dictionary database stores the list in order (`kanji.word_ent_seqs_json`); fixtures order their
 * candidate rows with `kanjiWords`.
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
}
