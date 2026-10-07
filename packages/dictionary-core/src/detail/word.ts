import { type Conjugations, conjugations } from './conjugation'
import { type Example, wordExample } from './examples'
import {
  type FrequencyResult,
  type FrequencyRowDetail,
  frequencyChips,
  frequencyRowDetails
} from './frequency'
import { withKanjiReadings } from './kanji-split'
import { partOfSpeechPhrase } from './part-of-speech'
import { type PitchAccent, pitchAccent } from './pitch'
import type {
  EntryRow,
  ExampleCountRow,
  FormRow,
  FrequencyRow,
  KanjiGlossRow,
  WordRows
} from './rows'
import { type RubySegment, rubySegments } from './ruby'
import { graphemes, isCJKUnifiedIdeograph, isKanjiCharacter } from './text'

export interface WordSummary {
  entSeq: number
  headword: string
  reading: string
  ruby: RubySegment[]
  summary: string
  frequency: FrequencyResult[]
}

export interface WordKanji {
  character: string
  meaning: string | null
}

export interface AlternativeForm {
  value: string
  kind: 'written' | 'reading'
  labels: string[]
  kanji: string | null
}

export interface RelatedWord {
  headword: string
  reading: string
  ruby: RubySegment[]
  relation: string
  summary: string
  entSeq: number | null
}

export interface WordDetail extends WordSummary {
  partOfSpeech: string
  conjugations: Conjugations | null
  pitch: PitchAccent | null
  senses: { number: number; meaning: string; notes: string[] }[]
  frequencyRows: FrequencyRowDetail[]
  alternatives: AlternativeForm[]
  kanji: WordKanji[]
  alternativeKanji: WordKanji[]
  related: RelatedWord[]
  examples: Example[]
  exampleCount: ExampleCountRow | null
  shareText: string
}

export function wordSummary(
  entry: Pick<EntryRow, 'entSeq' | 'headword' | 'reading' | 'summary'>,
  frequency: readonly FrequencyRow[]
): WordSummary {
  return {
    entSeq: entry.entSeq,
    headword: entry.headword,
    reading: entry.reading,
    ruby: rubySegments(entry.headword, entry.reading),
    summary: entry.summary,
    frequency: frequencyChips(frequency)
  }
}

export function primaryKanji(headword: string): string[] {
  return [...new Set(graphemes(headword).filter(isCJKUnifiedIdeograph))]
}

export function alternativeKanji(entry: Pick<EntryRow, 'headword' | 'writtenForms'>): string[] {
  const primary = new Set(primaryKanji(entry.headword))
  const seen = new Set<string>()
  return entry.writtenForms
    .filter(form => form.value !== entry.headword)
    .flatMap(form => graphemes(form.value))
    .filter(character => {
      if (!isCJKUnifiedIdeograph(character) || primary.has(character) || seen.has(character)) {
        return false
      }
      seen.add(character)
      return true
    })
}

function alternativeForms(
  entry: Pick<EntryRow, 'headword' | 'reading' | 'writtenForms' | 'readingForms'>
): FormRow[] {
  const seen = new Set<string>()
  return [...entry.writtenForms, ...entry.readingForms].filter(form => {
    if (form.value === entry.headword || form.value === entry.reading) return false
    if (form.labels.includes('Search only') || seen.has(form.value)) return false
    seen.add(form.value)
    return true
  })
}

function displayPartOfSpeech(entry: Pick<EntryRow, 'senses' | 'partsOfSpeech'>): string {
  return partOfSpeechPhrase(entry.senses[0]?.partsOfSpeech ?? entry.partsOfSpeech)
}

function wordShareText(entry: Pick<EntryRow, 'headword' | 'reading' | 'senses'>): string {
  const heading =
    entry.reading === entry.headword ? entry.headword : `${entry.headword}【${entry.reading}】`
  const meanings = entry.senses.map((sense, index) => `${index + 1}. ${sense.meaning}`)
  return [heading, ...meanings].join('\n')
}

function formKanji(value: string): string | null {
  const character = graphemes(value).find(isCJKUnifiedIdeograph)
  return character && isKanjiCharacter(character) ? character : null
}

const meaningsPerKanji = 2

function wordKanji(characters: string[], glosses: readonly KanjiGlossRow[]): WordKanji[] {
  return characters.filter(isKanjiCharacter).map(character => {
    const meanings = glosses.find(gloss => gloss.character === character)?.meanings ?? []
    return {
      character,
      meaning: meanings.length > 0 ? meanings.slice(0, meaningsPerKanji).join(', ') : null
    }
  })
}

export function wordDetail(rows: WordRows): WordDetail {
  const { entry } = rows
  const pitch = entry.pitch ?? entry.compoundPitch
  const summary = wordSummary(entry, rows.frequency)
  const readings = new Map(rows.kanji.map(({ character, readings }) => [character, readings]))
  return {
    ...summary,
    ruby: withKanjiReadings(summary.ruby, readings),
    partOfSpeech: displayPartOfSpeech(entry),
    conjugations: conjugations(entry, readings),
    pitch: pitch ? pitchAccent(entry.reading, pitch) : null,
    senses: entry.senses.map((sense, index) => ({
      number: index + 1,
      meaning: sense.meaning,
      notes: sense.notes
    })),
    frequencyRows: frequencyRowDetails(rows.frequency),
    alternatives: alternativeForms(entry).map(form => ({
      value: form.value,
      kind: form.kind,
      labels: form.labels,
      kanji: formKanji(form.value)
    })),
    kanji: wordKanji(primaryKanji(entry.headword), rows.kanji),
    alternativeKanji: wordKanji(alternativeKanji(entry), rows.kanji),
    related: entry.relationships.map(relationship => ({
      headword: relationship.headword,
      reading: relationship.reading,
      ruby: rubySegments(relationship.headword, relationship.reading),
      relation: relationship.relation,
      summary: relationship.summary,
      entSeq: relationship.targetEntSeq
    })),
    examples: rows.examples.map(wordExample),
    exampleCount: rows.exampleCount,
    shareText: wordShareText(entry)
  }
}
