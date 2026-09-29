// The word page, as the app's word detail shows it (WordDetailView.swift, DictionaryEntry.swift).

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
import { readingWithoutFurigana } from './reading-aids'
import { romanizeTrustedReading } from './romaji'
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

/** A word as a search result or list row shows it. */
export interface WordSummary {
  entSeq: number
  headword: string
  reading: string
  ruby: RubySegment[]
  /** The reading in romaji, shown under the headword with Romaji on; null when it has kanji. */
  romaji: string | null
  summary: string
  /** Chips for the dictionaries that rank or list the word. */
  frequency: FrequencyResult[]
}

export interface WordKanji {
  character: string
  /** The kanji's first two KANJIDIC2 meanings, when it has any. */
  meaning: string | null
}

export interface AlternativeForm {
  value: string
  kind: 'written' | 'reading'
  labels: string[]
  /** The form's first kanji, which the app opens when the form is selected. */
  kanji: string | null
  /** Under a reading, with Romaji on (the app's formLabel); null for a written form. */
  romaji: string | null
}

export interface RelatedWord {
  headword: string
  reading: string
  ruby: RubySegment[]
  relation: string
  summary: string
  entSeq: number | null
  /** Under the related word, with Romaji on. */
  romaji: string | null
}

export interface WordDetail extends WordSummary {
  /** The reading under the headword with Furigana off; null when the headword is its reading. */
  readingWithoutFurigana: string | null
  /** The first sense's word class; empty when none has a name, and the page shows no row. */
  partOfSpeech: string
  /** The conjugation table the part-of-speech row opens; null when it opens none. */
  conjugations: Conjugations | null
  pitch: PitchAccent | null
  senses: { number: number; meaning: string; notes: string[] }[]
  /** One row per default dictionary, including those without the word. */
  frequencyRows: FrequencyRowDetail[]
  alternatives: AlternativeForm[]
  kanji: WordKanji[]
  alternativeKanji: WordKanji[]
  related: RelatedWord[]
  /** The first examples; the page loads the rest (up to the app's 100) as it scrolls. */
  examples: Example[]
  exampleCount: ExampleCountRow | null
  /** What Share sends: the headword, its reading, and the numbered meanings. */
  shareText: string
}

/** A word as a search result shows it. */
export function wordSummary(
  entry: Pick<EntryRow, 'entSeq' | 'headword' | 'reading' | 'summary'>,
  frequency: readonly FrequencyRow[]
): WordSummary {
  return {
    entSeq: entry.entSeq,
    headword: entry.headword,
    reading: entry.reading,
    ruby: rubySegments(entry.headword, entry.reading),
    romaji: romanizeTrustedReading(entry.reading),
    summary: entry.summary,
    frequency: frequencyChips(frequency)
  }
}

/** `DictionaryEntry.primaryKanji`: the headword's CJK unified ideographs, each once, in order. */
export function primaryKanji(headword: string): string[] {
  return [...new Set(graphemes(headword).filter(isCJKUnifiedIdeograph))]
}

/** `DictionaryEntry.alternativeKanji`: kanji in the other written forms that the headword lacks. */
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

/**
 * `DictionaryEntry.alternativeForms`: the other written forms, then the other readings, without
 * `Search only` forms or repeats.
 */
export function alternativeForms(
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

/** `DictionaryEntry.displayPartOfSpeech`: the first sense's, falling back to the entry's. */
export function displayPartOfSpeech(entry: Pick<EntryRow, 'senses' | 'partsOfSpeech'>): string {
  return partOfSpeechPhrase(entry.senses[0]?.partsOfSpeech ?? entry.partsOfSpeech)
}

/** WordDetailView's `shareText`. */
export function wordShareText(entry: Pick<EntryRow, 'headword' | 'reading' | 'senses'>): string {
  const heading =
    entry.reading === entry.headword ? entry.headword : `${entry.headword}【${entry.reading}】`
  const meanings = entry.senses.map((sense, index) => `${index + 1}. ${sense.meaning}`)
  return [heading, ...meanings].join('\n')
}

/** AlternativeFormLine: the form's first kanji opens that kanji, when it is one. */
function formKanji(value: string): string | null {
  const character = graphemes(value).find(isCJKUnifiedIdeograph)
  return character && isKanjiCharacter(character) ? character : null
}

function wordKanji(characters: string[], glosses: readonly KanjiGlossRow[]): WordKanji[] {
  // Like the app's KanjiCharacter, a character with a variation selector has no kanji page.
  return characters.filter(isKanjiCharacter).map(character => {
    const meanings = glosses.find(gloss => gloss.character === character)?.meanings ?? []
    return { character, meaning: meanings.length > 0 ? meanings.slice(0, 2).join(', ') : null }
  })
}

/** Everything the word page shows, in the app's section order. */
export function wordDetail(rows: WordRows): WordDetail {
  const { entry } = rows
  const pitch = entry.pitch ?? entry.compoundPitch
  const summary = wordSummary(entry, rows.frequency)
  const readings = new Map(rows.kanji.map(({ character, readings }) => [character, readings]))
  return {
    ...summary,
    // The headword's kanji highlight their own part of the furigana when tapped.
    ruby: withKanjiReadings(summary.ruby, readings),
    readingWithoutFurigana: readingWithoutFurigana(entry.headword, entry.reading),
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
      kanji: formKanji(form.value),
      romaji: form.kind === 'reading' ? romanizeTrustedReading(form.value) : null
    })),
    kanji: wordKanji(primaryKanji(entry.headword), rows.kanji),
    alternativeKanji: wordKanji(alternativeKanji(entry), rows.kanji),
    related: entry.relationships.map(relationship => ({
      headword: relationship.headword,
      reading: relationship.reading,
      ruby: rubySegments(relationship.headword, relationship.reading),
      relation: relationship.relation,
      summary: relationship.summary,
      entSeq: relationship.targetEntSeq,
      romaji: romanizeTrustedReading(relationship.reading)
    })),
    examples: rows.examples.map(wordExample),
    exampleCount: rows.exampleCount,
    shareText: wordShareText(entry)
  }
}
