/**
 * Dictionary records as the shared language-data artifact stores them (ADR 0006). The website's
 * D1 copy returns these shapes; until it exists, local fixtures do (src/lib/dictionary/fixtures).
 */

export interface SenseRecord {
  meaning: string
  notes: string[]
  partsOfSpeech: string[]
}

export interface PitchRecord {
  /** 0 for flat (heiban); otherwise the mora after which pitch falls. */
  downstep: number
  moraCount: number
}

export interface EntryRecord {
  /** Language Reference ID, lowercase hex. */
  id: string
  /** JMdict entry number, the public ID in word page URLs (ADR 0007). */
  entSeq: number
  headword: string
  reading: string
  summary: string
  partsOfSpeech: string[]
  senses: SenseRecord[]
  pitch: PitchRecord | null
}

export type FrequencyBand = 'veryCommon' | 'common' | 'uncommon' | 'rare'

export interface FrequencyRecord {
  source: string
  value: string
  band: FrequencyBand
}

export interface ExampleTokenRecord {
  text: string
  reading?: string
  /** A dictionary word the learner can look up; drawn with an underline. */
  isWord?: boolean
  /** Part of the entry the example illustrates. */
  isMatch?: boolean
}

export interface ExampleRecord {
  tokens: ExampleTokenRecord[]
  translation: string
}

export interface KanjiReadingRecord {
  kind: 'on' | 'kun' | 'name'
  value: string
  /** Words that use this reading, as their headword and summary. */
  words: { headword: string; summary: string }[]
}

export interface KanjiElementRecord {
  character: string
  role: string
  meaning: string
}

export interface KanjiRecord {
  character: string
  strokeCount: number
  grade: number | null
  jlpt: number | null
  meanings: string[]
  readings: KanjiReadingRecord[]
  elements: KanjiElementRecord[]
  /** JMdict entry numbers of words written with this kanji, in display order. */
  words: number[]
}
