import { LruCache } from '../artifact/cache'
import { checkKanjiSources, type KanjiElementSources, KanjiReference } from '../artifact/kanji-data'
import { sharedSpellingNote } from '../detail/conjugation'
import { noExamplesMessage } from '../detail/examples'
import { type FrequencyLookupRow, frequencyLookupRow } from '../detail/frequency'
import {
  type KanjiDetail,
  kanjiDetail,
  kanjiSections,
  kanjiSectionsWithoutContent,
  savedKanjiReading
} from '../detail/kanji'
import { type KanjiElementDetail, kanjiElementDetail } from '../detail/kanji-element'
import { type KanjiReadings, withKanjiReadings } from '../detail/kanji-split'
import { type PitchAccent, shownPitch } from '../detail/pitch'
import type { FormRow, KanjiReadingRow, KanjiStrokesRow, PitchRow } from '../detail/rows'
import { type RubySegment, rubySegments } from '../detail/ruby'
import { pronounceLabel } from '../detail/sections'
import { type StrokeDiagram, strokeDiagram } from '../detail/strokes'
import { isKanjiCharacter } from '../detail/text'
import {
  type WordDetail,
  wordDetail,
  wordSections,
  wordSectionsWithoutContent
} from '../detail/word'
import {
  evidenceLookups,
  type LearnerResultsScreen,
  type LearnerState,
  learnerResultsScreen,
  type ReadFrequency,
  type WordRow,
  wordRows
} from '../results/learner'
import type { ListedResults } from '../results/results'
import { checkedRadicalFile, RadicalLookup, type RadicalPanel } from '../search/radicals'
import { type EmbeddedHost, hostFrequency } from './host'

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
  compoundPitch: PitchRow | null
}

type Conjugations = NonNullable<WordDetail['conjugations']>
type ConjugationRows = Conjugations['rows']

export interface EmbeddedWordPage
  extends Pick<
    WordDetail,
    | 'sections'
    | 'ruby'
    | 'partOfSpeech'
    | 'partOfSpeechRow'
    | 'pronounce'
    | 'senses'
    | 'alternatives'
    | 'related'
    | 'shareText'
  > {
  noExamples: string
  pitch: (PitchAccent & { source: string }) | null
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
  frequency: FrequencyLookupRow[]
}

export interface EmbeddedKanjiPage extends Omit<KanjiDetail, 'strokeOrder'> {
  hasReference: boolean
  savedReading: string
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

const rememberedKanji = 4_000

export class EmbeddedPresentation {
  private files: KanjiFiles | undefined
  private radicals: RadicalLookup | undefined
  private readonly frequency: ReadFrequency = ids => hostFrequency(this.host, ids)
  private readonly readingsByKanji = new LruCache<string, readonly KanjiReadingRow[]>(
    rememberedKanji
  )
  private readonly kanjiReadings: KanjiReadings = {
    get: character => {
      let readings = this.readingsByKanji.get(character)
      if (!readings) {
        const rows = this.kanji.glossRows([character])
        readings = rows.find(row => row.character === character)?.readings ?? []
        this.readingsByKanji.set(character, readings)
      }
      return readings
    }
  }

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
      request.learner,
      this.frequency
    )
  }

  wordRows(request: { entries: { id: string; summary: string }[]; known: string[] }): WordRow[] {
    const known = new Set(request.known)
    return wordRows(
      request.entries.map(({ id, summary }) => ({
        id,
        entrySummary: summary,
        matchedSummary: null
      })),
      evidenceLookups(this.frequency(request.entries.map(({ id }) => id))),
      id => known.has(id),
      index => `Result ${index + 1} of ${request.entries.length}`
    )
  }

  ruby([surface, reading]: [string, string]): RubySegment[] {
    return withKanjiReadings(rubySegments(surface, reading), this.kanjiReadings)
  }

  wordPage(entry: EmbeddedEntry): EmbeddedWordPage {
    const pitches = { pitch: entry.pitch ?? null, compoundPitch: entry.compoundPitch ?? null }
    const shown = shownPitch(pitches)
    const detail = wordDetail({
      entry: {
        ...entry,
        entSeq: 0,
        senses: entry.senses.map(sense => ({ ...sense, restrictions: [] })),
        relationships: entry.relationships.map(relationship => ({
          ...relationship,
          targetEntSeq: null
        })),
        ...pitches
      },
      frequency: [],
      kanji: this.kanji.glossRows([entry.headword, ...entry.writtenForms.map(form => form.value)]),
      examples: [],
      exampleCount: null
    })
    const frequency = (evidenceLookups(this.frequency([entry.id]))(entry.id) ?? []).map(
      frequencyLookupRow
    )
    const noted = (rows: Conjugations['rows']['Plain']) =>
      rows.map(row => ({
        ...row,
        note: row.sharedSpellings.length > 0 ? sharedSpellingNote(row.sharedSpellings) : null
      }))
    return {
      sections: wordSections(detail, { frequency: frequency.length > 0, conjugations: false }),
      ruby: detail.ruby,
      partOfSpeech: detail.partOfSpeech,
      partOfSpeechRow: detail.partOfSpeechRow,
      pronounce: detail.pronounce,
      conjugations: detail.conjugations && {
        ...detail.conjugations,
        rows: {
          Plain: noted(detail.conjugations.rows.Plain),
          Polite: noted(detail.conjugations.rows.Polite)
        }
      },
      pitch: detail.pitch && shown && { ...detail.pitch, source: shown.sourceIdentity },
      senses: detail.senses,
      alternatives: detail.alternatives,
      kanji: detail.kanji.map(({ character }) => character),
      alternativeKanji: detail.alternativeKanji.map(({ character }) => character),
      frequency,
      related: detail.related,
      noExamples: noExamplesMessage,
      shareText: detail.shareText
    }
  }

  wordPageWithoutContent(
    reading: string
  ): Pick<EmbeddedWordPage, 'sections' | 'pronounce' | 'noExamples'> {
    return {
      sections: wordSectionsWithoutContent,
      pronounce: pronounceLabel(reading),
      noExamples: noExamplesMessage
    }
  }

  kanjiPageWithoutContent(): Pick<EmbeddedKanjiPage, 'sections'> {
    return { sections: kanjiSectionsWithoutContent }
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
      sections: kanjiSections(detail, { readingsWhenNone: kanji !== null }),
      hasReference: kanji !== null,
      savedReading: savedKanjiReading(detail),
      stats: kanji ? detail.stats : [],
      words: [...leading, ...detail.words.filter(word => word.id !== request.leadingWord)]
    }
  }

  candidateMeanings(candidates: readonly string[]): (string | null)[] {
    return candidates.map(candidate =>
      isKanjiCharacter(candidate) ? (this.kanji.row(candidate)?.meanings[0] ?? null) : null
    )
  }

  kanjiElementPage(glyph: string): KanjiElementDetail | null {
    if (!isKanjiCharacter(glyph)) return null
    const { reference, elementSources } = this.kanjiFiles
    const rows = reference.elementPageRows(glyph, elementSources)
    return rows && kanjiElementDetail(rows)
  }

  kanjiStrokes(row: KanjiStrokesRow & { character: string }): StrokeDiagram {
    return strokeDiagram(row)
  }

  radicalPanel(selected: string[]): RadicalPanel {
    if (!this.radicals) {
      const file = this.host.radicals?.()
      if (!file) throw new Error('The host has no radical file to read')
      this.radicals = new RadicalLookup(checkedRadicalFile(file))
    }
    return this.radicals.panel(selected)
  }
}
