import type {
  SuiteConjugations,
  SuiteFrequencyDetails,
  SuiteFurigana,
  SuitePitchGraph
} from '@zenbu/dictionary-core/detail/suite'
import { readSuite } from './support'

interface Artifact {
  name: string
  sha256: string
}

export interface SuiteWord {
  headword: string
  id: string
  reading: string
  summary: string
}

interface SuiteToken {
  surface: string
  entry?: string
  candidates?: string[]
  pageWord?: boolean
}

export interface SuiteExamples {
  listed: number
  reportedCount?: string
  truncated: boolean
  error?: string
  shown: { id: string; japanese: string; english: string; tokens: SuiteToken[] }[]
}

export interface WordCase {
  covers: string
  entSeq: string[]
  id: string
  languageReferenceID: string
  headword: string
  reading: string
  furigana: SuiteFurigana[]
  partOfSpeech: string
  opensConjugations: boolean
  conjugations?: SuiteConjugations
  senses: { meaning: string; notes: string[]; partsOfSpeech: string[] }[]
  pitch?: {
    downstep: number
    levels: string
    moraCount: number
    particle: string
    source: string
    graph: SuitePitchGraph
  }
  frequency: {
    name: string
    pack: string
    text: string
    tier?: string
    details: SuiteFrequencyDetails
  }[]
  alternativeForms: { kind: string; labels: string[]; value: string }[]
  kanji: { character: string; meanings: string[] }[]
  alternativeKanji: { character: string; meanings: string[] }[]
  relatedWords: {
    headword: string
    reading: string
    relation: string
    summary: string
    targetID?: string
  }[]
  examples: SuiteExamples
}

export interface KanjiCase {
  character: string
  codePoint: string
  covers: string
  opensDetail: boolean
  hasReference?: boolean
  hasStrokeOrder?: boolean
  strokeOrderStrokes?: number
  strokeCount?: number
  grade?: number
  jlpt?: string
  meanings?: string[]
  readings?: { kind: string; value: string; words: SuiteWord[] }[]
  words?: SuiteWord[]
  elements?: { glyph: string; meanings: string[]; linkedOnReadings?: string[]; role: string }[]
  components?: string[]
}

interface SuiteElementKanji {
  character: string
  codePoint: string
  meanings: string[]
  onReadings: string[]
  spoken: string
}

export interface KanjiElementCase {
  glyph: string
  codePoint: string
  covers: string
  opensDetail: boolean
  hasPage?: boolean
  meanings?: string[]
  explanation?: string
  soundPatterns?: string
  alternatives?: string[]
  alternativeCodePoints?: string[]
  standalone?: SuiteElementKanji
  containing?: SuiteElementKanji[]
  structureSource?: string
  metadataSource?: string
}

interface Suite<Case> {
  artifacts: Artifact[]
  cases: Case[]
  exampleLimit?: number
  formExampleLimit?: number
}

export const wordSuite = readSuite<Suite<WordCase>>('word-detail')
export const kanjiSuite = readSuite<Suite<KanjiCase>>('kanji-detail')
export const kanjiElementSuite = readSuite<Suite<KanjiElementCase>>('kanji-element')

export function withoutFields<Case extends object>(
  expected: Case,
  skipped: string[]
): Partial<Case> {
  return Object.fromEntries(
    Object.entries(expected).filter(([key]) => !skipped.includes(key))
  ) as Partial<Case>
}

export const codePoint = (character: string) =>
  `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`

export const codePoints = (text: string) => Array.from(text, codePoint).join(' ')
