import {
  fixtureEntries,
  fixtureExamples,
  fixtureFrequency,
  fixtureKanji,
  fixtureSearchOrder
} from '@/lib/dictionary/fixtures'
import { isProductionSite } from '@/lib/site'
import { furigana, partOfSpeechPhrase, pitchMorae, type RubySegment } from './display'
import type {
  EntryRecord,
  ExampleRecord,
  FrequencyRecord,
  KanjiReadingRecord,
  KanjiRecord,
  SenseRecord
} from './records'
import { kanjiPath, wordPath, wordSlug } from './urls'

// Pages read the dictionary only through this module. It serves local fixtures until the D1
// copy exists (#464); then only these functions change.

/** Production shows no dictionary pages until real data is loaded, so fixtures are never indexed. */
export function isDictionaryAvailable(): boolean {
  return !isProductionSite()
}

export interface WordSummary {
  entSeq: number
  headword: string
  reading: string
  ruby: RubySegment[]
  summary: string
  path: string
  frequency: FrequencyRecord[]
}

export interface WordPageData extends WordSummary {
  /** Where the word's page lives now; a request under another slug redirects here. */
  slug: string
  partOfSpeech: string
  pitch: { morae: { mora: string; high: boolean }[]; downstep: number } | null
  senses: SenseRecord[]
  kanji: { character: string; meaning: string | null; path: string | null }[]
  examples: ExampleRecord[]
}

export interface KanjiPageData extends Omit<KanjiRecord, 'readings' | 'words'> {
  readings: (Omit<KanjiReadingRecord, 'words'> & {
    words: { headword: string; summary: string; path: string | null }[]
  })[]
  words: WordSummary[]
}

export interface SearchData {
  query: string
  kanji: { character: string; meanings: string[]; path: string } | null
  words: WordSummary[]
}

const entriesBySeq = new Map(fixtureEntries.map(entry => [entry.entSeq, entry]))
const kanjiByCharacter = new Map(fixtureKanji.map(kanji => [kanji.character, kanji]))

function summarize(entry: EntryRecord): WordSummary {
  return {
    entSeq: entry.entSeq,
    headword: entry.headword,
    reading: entry.reading,
    ruby: furigana(entry.headword, entry.reading),
    summary: entry.summary,
    path: wordPath(entry),
    frequency: fixtureFrequency[entry.entSeq] ?? []
  }
}

export async function getWordPage(entSeq: number): Promise<WordPageData | null> {
  const entry = entriesBySeq.get(entSeq)
  if (!entry) return null
  const characters = [...new Set(entry.headword.match(/\p{Script=Han}/gu) ?? [])]
  return {
    ...summarize(entry),
    slug: wordSlug(entry.headword, entry.reading),
    partOfSpeech: partOfSpeechPhrase(entry.partsOfSpeech),
    pitch: entry.pitch
      ? { morae: pitchMorae(entry.reading, entry.pitch.downstep), downstep: entry.pitch.downstep }
      : null,
    senses: entry.senses,
    kanji: characters.map(character => {
      const kanji = kanjiByCharacter.get(character)
      return {
        character,
        meaning: kanji ? kanji.meanings.slice(0, 2).join(', ') : null,
        path: kanji ? kanjiPath(character) : null
      }
    }),
    examples: fixtureExamples[entry.entSeq] ?? []
  }
}

export async function getKanjiPage(character: string): Promise<KanjiPageData | null> {
  const kanji = kanjiByCharacter.get(character)
  if (!kanji) return null
  return {
    ...kanji,
    readings: kanji.readings.map(reading => ({
      ...reading,
      words: reading.words.map(word => {
        const entry = fixtureEntries.find(
          candidate =>
            candidate.headword === word.headword && candidate.summary.startsWith(word.summary)
        )
        return { ...word, path: entry ? wordPath(entry) : null }
      })
    })),
    words: kanji.words.flatMap(entSeq => {
      const entry = entriesBySeq.get(entSeq)
      return entry ? [summarize(entry)] : []
    })
  }
}

export async function searchDictionary(query: string): Promise<SearchData> {
  const kanji = kanjiByCharacter.get(query)
  const ordered = fixtureSearchOrder[query]
  const matches = ordered
    ? ordered.flatMap(entSeq => entriesBySeq.get(entSeq) ?? [])
    : fixtureEntries.filter(
        entry =>
          entry.headword === query ||
          entry.reading === query ||
          entry.summary.toLowerCase().split(/[,;] /).includes(query)
      )
  return {
    query,
    kanji: kanji
      ? { character: kanji.character, meanings: kanji.meanings, path: kanjiPath(kanji.character) }
      : null,
    words: matches.map(summarize)
  }
}
