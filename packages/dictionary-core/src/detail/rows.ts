export interface FormRow {
  value: string
  kind: 'written' | 'reading'
  labels: string[]
}

export interface SenseRestrictionRow {
  kind: 'written' | 'reading'
  form: string
}

export interface SenseRow {
  meaning: string
  notes: string[]
  partsOfSpeech: string[]
  restrictions: SenseRestrictionRow[]
}

export interface PitchRow {
  downstep: number
  moraCount: number
  sourceIdentity: string
}

export interface RelationshipRow {
  headword: string
  reading: string
  summary: string
  relation: string
  targetEntSeq: number | null
}

export interface EntryRow {
  id: string
  entSeq: number
  headword: string
  reading: string
  summary: string
  partsOfSpeech: string[]
  writtenForms: FormRow[]
  readingForms: FormRow[]
  senses: SenseRow[]
  relationships: RelationshipRow[]
  pitch: PitchRow | null
  compoundPitch: PitchRow | null
}

export type FrequencyRow = { pack: 'jlpt'; level: number } | { pack: 'tubelex'; rank: number }

export interface KanjiGlossRow {
  character: string
  meanings: string[]
  readings: KanjiReadingRow[]
}

export interface ExampleSentenceTokenRow {
  text: string
  reading?: string
  dictionaryForm?: string
}

export interface ExampleLinkRow {
  token: number
  entSeqs: number[]
  reading?: string
}

export interface ExampleSentenceRow {
  id: number
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

export interface WordExampleRow {
  entSeq: number
  position: number
  sentenceId: number
  highlights: number[]
  links: ExampleLinkRow[]
  tokens: ExampleSentenceTokenRow[] | null
}

export interface WordExampleRows {
  sentence: ExampleSentenceRow
  example: WordExampleRow
}

export interface FormExampleRow {
  surface: string
  position: number
  sentenceId: number
  highlights: number[]
  links: ExampleLinkRow[]
}

export interface FormExampleRows {
  sentence: ExampleSentenceRow
  example: FormExampleRow
}

export interface ExampleCountRow {
  listed: number
  count: number
  truncated: boolean
}

export interface WordRows {
  entry: EntryRow
  frequency: FrequencyRow[]
  kanji: KanjiGlossRow[]
  examples: WordExampleRows[]
  exampleCount: ExampleCountRow | null
}

export interface KanjiReadingRow {
  value: string
  kind: 'on' | 'kun' | 'name'
}

export interface KanjiRow {
  character: string
  strokeCount: number
  grade: number | null
  jlpt: number | null
  meanings: string[]
  readings: KanjiReadingRow[]
  components: string[]
}

export interface KanjiStructureRow {
  onReadings: string[]
  elementGlyphs: string[]
  explicitPhoneticElement: string | null
}

export interface KanjiElementRow {
  glyph: string
  meanings: string[]
  commonLinkedOnReadings: string[]
}

export interface KanjiWordRow {
  id: string
  entSeq: number
  headword: string
  reading: string
  summary: string
  fingerprint: string
  isCommon: boolean
  rankScore: number
  containsKanji: boolean
}

export type KanjiListWordRow = Pick<
  KanjiWordRow,
  'id' | 'entSeq' | 'headword' | 'reading' | 'summary'
>

export interface KanjiRows {
  kanji: KanjiRow
  structure: KanjiStructureRow | null
  elements: KanjiElementRow[]
  words: KanjiListWordRow[]
  strokes: KanjiStrokesRow | null
}

export interface KanjiStrokesRow {
  viewportSize: number
  strokeCount: number
  strokes: number[][]
}
