import { checkKanjiSources, type KanjiElementSources, KanjiReference } from '../artifact/kanji-data'
import { sharedSpellingNote } from '../detail/conjugation'
import { type FrequencyLookupRow, frequencyLookupRow } from '../detail/frequency'
import { type KanjiDetail, kanjiDetail } from '../detail/kanji'
import { type KanjiElementDetail, kanjiElementDetail } from '../detail/kanji-element'
import { withKanjiReadings } from '../detail/kanji-split'
import type { FormRow, PitchRow } from '../detail/rows'
import { type RubySegment, rubySegments } from '../detail/ruby'
import { isKanjiCharacter } from '../detail/text'
import { type WordDetail, wordDetail } from '../detail/word'
import {
  evidenceLookups,
  type FrequencyEvidence,
  type LearnerResultsScreen,
  type LearnerState,
  learnerResultsScreen,
  type WordRow,
  wordRows
} from '../results/learner'
import type { ListedResults } from '../results/results'
import type { EmbeddedHost } from './host'

export interface EmbeddedEntry {
  id: string
  headword: string
  reading: string
  summary: string
  partsOfSpeech: string[]
  writtenForms: FormRow[]
  readingForms: FormRow[]
  senses: { meaning: string; notes: string[]; partsOfSpeech: string[] }[]
  relationships: { headword: string; reading: string; summary: string; relation: string }[]
  pitch: PitchRow | null
}

type Conjugations = NonNullable<WordDetail['conjugations']>
type ConjugationRows = Conjugations['rows']

export interface EmbeddedWordPage
  extends Pick<
    WordDetail,
    'ruby' | 'partOfSpeech' | 'pitch' | 'senses' | 'alternatives' | 'related' | 'shareText'
  > {
  conjugations:
    | (Omit<Conjugations, 'rows'> & {
        rows: {
          [Mode in keyof ConjugationRows]: (ConjugationRows[Mode][number] & {
            note: string | null
          })[]
        }
      })
    | null
  kanji: string[]
  alternativeKanji: string[]
}

export interface EmbeddedKanjiPage extends Omit<KanjiDetail, 'strokeOrder'> {
  hasReference: boolean
}

interface KanjiPageWord {
  id: string
  headword: string
  reading: string
  summary: string
}

interface KanjiFiles {
  reference: KanjiReference
  elementSources: KanjiElementSources
}

export class EmbeddedPresentation {
  private files: KanjiFiles | undefined

  constructor(private readonly host: EmbeddedHost) {}

  private get kanjiFiles(): KanjiFiles {
    if (!this.files) {
      const host = this.host
      const sources = host.kanjiSources?.()
      if (!sources) throw new Error('The host has no kanji files to read')
      checkKanjiSources(sources)
      this.files = {
        reference: new KanjiReference({
          entry: character => host.kanjiEntry?.(character) ?? undefined,
          structure: character => host.kanjiStructure?.(character) ?? undefined,
          element: glyph => host.kanjiElement?.(glyph) ?? undefined
        }),
        elementSources: sources.elements
      }
    }
    return this.files
  }

  private get kanji(): KanjiReference {
    return this.kanjiFiles.reference
  }

  resultsScreen(request: {
    query: string
    results: ListedResults
    exampleCount: number
    learner: LearnerState
  }): LearnerResultsScreen {
    return learnerResultsScreen(
      request.query,
      request.results,
      request.exampleCount,
      request.learner
    )
  }

  wordRows(request: {
    entries: { id: string; summary: string }[]
    frequency: FrequencyEvidence | null
    known: string[]
  }): WordRow[] {
    const known = new Set(request.known)
    return wordRows(
      request.entries.map(({ id, summary }) => ({
        id,
        entrySummary: summary,
        matchedSummary: null
      })),
      evidenceLookups(request.frequency),
      id => known.has(id),
      index => `Result ${index + 1} of ${request.entries.length}`
    )
  }

  frequencyRows(request: { entry: string; frequency: FrequencyEvidence }): FrequencyLookupRow[] {
    return (evidenceLookups(request.frequency)(request.entry) ?? []).map(frequencyLookupRow)
  }

  ruby([surface, reading]: [string, string]): RubySegment[] {
    const readings = new Map(
      this.kanji.glossRows([surface]).map(({ character, readings }) => [character, readings])
    )
    return withKanjiReadings(rubySegments(surface, reading), readings)
  }

  wordPage(entry: EmbeddedEntry): EmbeddedWordPage {
    const detail = wordDetail({
      entry: {
        ...entry,
        entSeq: 0,
        senses: entry.senses.map(sense => ({ ...sense, restrictions: [] })),
        relationships: entry.relationships.map(relationship => ({
          ...relationship,
          targetEntSeq: null
        })),
        compoundPitch: null
      },
      frequency: [],
      kanji: this.kanji.glossRows([entry.headword, ...entry.writtenForms.map(form => form.value)]),
      examples: [],
      exampleCount: null
    })
    const noted = (rows: Conjugations['rows']['Plain']) =>
      rows.map(row => ({
        ...row,
        note: row.sharedSpellings.length > 0 ? sharedSpellingNote(row.sharedSpellings) : null
      }))
    return {
      ruby: detail.ruby,
      partOfSpeech: detail.partOfSpeech,
      conjugations: detail.conjugations && {
        ...detail.conjugations,
        rows: {
          Plain: noted(detail.conjugations.rows.Plain),
          Polite: noted(detail.conjugations.rows.Polite)
        }
      },
      pitch: detail.pitch,
      senses: detail.senses,
      alternatives: detail.alternatives,
      kanji: detail.kanji.map(({ character }) => character),
      alternativeKanji: detail.alternativeKanji.map(({ character }) => character),
      related: detail.related,
      shareText: detail.shareText
    }
  }

  kanjiPage(request: {
    character: string
    words: KanjiPageWord[]
    leadingWord: string | null
  }): EmbeddedKanjiPage {
    const { character } = request
    const words = request.words.map(word => ({ ...word, entSeq: 0 }))
    const kanji = this.kanji.row(character)
    const structure = this.kanji.structure(character)
    const elements = structure ? this.kanji.elementRows(structure.elementGlyphs) : []
    const { strokeOrder: _, ...detail } = kanjiDetail({
      kanji: kanji ?? {
        character,
        strokeCount: 0,
        grade: null,
        jlpt: null,
        meanings: [],
        readings: [],
        components: []
      },
      structure,
      elements,
      words,
      strokes: null
    })
    const leading = detail.words.filter(word => word.id === request.leadingWord)
    return {
      ...detail,
      hasReference: kanji !== null,
      stats: kanji ? detail.stats : [],
      words: [...leading, ...detail.words.filter(word => word.id !== request.leadingWord)]
    }
  }

  kanjiMeanings(character: string): string[] {
    return this.kanji.row(character)?.meanings ?? []
  }

  kanjiElementPage(glyph: string): KanjiElementDetail | null {
    if (!isKanjiCharacter(glyph)) return null
    const { reference, elementSources } = this.kanjiFiles
    const rows = reference.elementPageRows(glyph, elementSources)
    return rows && kanjiElementDetail(rows)
  }
}
