import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import type { Dictionary, WordResponse } from '@zenbu/dictionary-core/artifact/dictionary'
import { licenseUrl } from '@zenbu/dictionary-core/detail/examples'
import { tierLabels } from '@zenbu/dictionary-core/detail/frequency'
import { kanjiDetail } from '@zenbu/dictionary-core/detail/kanji'
import type { ExampleCountRow, ExampleSentenceRow } from '@zenbu/dictionary-core/detail/rows'
import {
  type SuiteConjugationForm,
  type SuiteConjugations,
  type SuiteFormExamples,
  type SuiteFrequencyDetails,
  type SuiteFurigana,
  type SuitePitchGraph,
  suiteConjugations,
  suiteFrequencyDetails,
  suiteFurigana,
  suitePitchGraph
} from '@zenbu/dictionary-core/detail/suite'
import { wordDetail } from '@zenbu/dictionary-core/detail/word'
import { beforeAll, describe, expect, test } from 'vitest'
import { languageReferenceIds, shownAsRecorded } from './examples'
import {
  artifactAvailable,
  artifactDatabase,
  dictionary,
  readSuite,
  requirePinnedArtifacts
} from './support'

interface Artifact {
  name: string
  sha256: string
}

interface SuiteWord {
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

interface SuiteExamples {
  listed: number
  reportedCount?: string
  truncated: boolean
  error?: string
  shown: { id: string; japanese: string; english: string; tokens: SuiteToken[] }[]
}

interface WordCase {
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

interface KanjiCase {
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

interface Suite<Case> {
  artifacts: Artifact[]
  cases: Case[]
  exampleLimit?: number
  formExampleLimit?: number
}

const wordSuite = readSuite<Suite<WordCase>>('word-detail')
const kanjiSuite = readSuite<Suite<KanjiCase>>('kanji-detail')

const defaultFrequencyPackIds: Record<string, string> = {
  JLPT: 'zenbu.jlpt.waller.levels',
  YouTube: 'zenbu.tubelex.youtube.ja.unidic-3.1'
}

const meaningsShownPerKanji = 2
const meaningsShownPerElement = 3

function withoutFields<Case extends object>(expected: Case, skipped: string[]): Partial<Case> {
  return Object.fromEntries(
    Object.entries(expected).filter(([key]) => !skipped.includes(key))
  ) as Partial<Case>
}

const codePoint = (character: string) =>
  `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`

function expectEachSideAttributed(sentence: ExampleSentenceRow) {
  for (const side of ['japanese', 'english'] as const) {
    expect(Number.isInteger(sentence[`${side}TatoebaId`])).toBe(true)
    expect(licenseUrl(sentence[`${side}License`])).not.toBeNull()
    expect([null, 'string']).toContain(
      sentence[`${side}Contributor`] === null ? null : typeof sentence[`${side}Contributor`]
    )
  }
}

describe.runIf(artifactAvailable)('word and kanji detail conformance', () => {
  let service: Dictionary
  let db: ArtifactDatabase

  beforeAll(async () => {
    requirePinnedArtifacts([...wordSuite.artifacts, ...kanjiSuite.artifacts])
    service = await dictionary({ morphology: false })
    db = await artifactDatabase()
  })

  function wordExamplesAsRecorded(
    entSeq: number,
    count: ExampleCountRow | null,
    limit: number,
    recorded: SuiteExamples
  ): SuiteExamples {
    const found = service.wordExamples(entSeq, 0, limit)
    if (!found) throw new Error(`No word ${entSeq}`)
    const listsNothingAsTheAppDoes =
      recorded.error !== undefined && count === null && found.rows.length === 0
    if (listsNothingAsTheAppDoes) {
      return { listed: 0, truncated: false, error: recorded.error, shown: [] }
    }
    for (const { sentence } of found.rows) expectEachSideAttributed(sentence)
    return {
      listed: count?.listed ?? 0,
      reportedCount: count && count.count > 50 ? 'more than 50' : String(count?.count ?? 0),
      truncated: count?.truncated ?? false,
      shown: shownAsRecorded(db, found.rows, 'pageWord')
    }
  }

  function formExamplesAsRecorded(surface: string, limit: number): SuiteFormExamples {
    const found = service.formExamples(surface, 0, 100)
    expect(found.rows.length).toBe(found.listed)
    return {
      ids: found.rows.map(({ sentence }) => `esp1_${sentence.pairId}`),
      shown: shownAsRecorded(db, found.rows.slice(0, limit), 'highlighted')
    }
  }

  function conjugationsAsRecorded(
    conjugations: SuiteConjugations,
    limit: number
  ): SuiteConjugations {
    const withExamples = (forms: SuiteConjugationForm[]) =>
      forms.map(form => ({ ...form, examples: formExamplesAsRecorded(form.surface, limit) }))
    return {
      ...conjugations,
      plain: withExamples(conjugations.plain),
      ...(conjugations.polite ? { polite: withExamples(conjugations.polite) } : {})
    }
  }

  test.each(wordSuite.cases)('word: $covers', async expected => {
    const word = service.word(Number(expected.entSeq[0])) as WordResponse
    expect(word, 'no word').not.toBeNull()
    const { entry } = word.rows
    const detail = wordDetail(word.rows)
    const related = detail.related.flatMap(r => (r.entSeq === null ? [] : [r.entSeq]))
    const targetIds = languageReferenceIds(db, related)
    const glosses = new Map(word.rows.kanji.map(gloss => [gloss.character, gloss.meanings]))
    const kanji = (list: typeof detail.kanji) =>
      list.map(({ character, meaning }) => {
        const meanings = glosses.get(character) ?? []
        expect(meaning).toBe(
          meanings.length > 0 ? meanings.slice(0, meaningsShownPerKanji).join(', ') : null
        )
        return { character, meanings }
      })
    const pitch = entry.pitch ?? entry.compoundPitch
    const observed: Omit<WordCase, 'covers' | 'entSeq'> = {
      id: entry.id,
      languageReferenceID: entry.id,
      headword: detail.headword,
      reading: detail.reading,
      furigana: suiteFurigana(detail.ruby),
      partOfSpeech: detail.partOfSpeech,
      opensConjugations: detail.conjugations !== null,
      ...(detail.conjugations
        ? {
            conjugations: conjugationsAsRecorded(
              suiteConjugations(detail.conjugations, entry.summary),
              wordSuite.formExampleLimit ?? 0
            )
          }
        : {}),
      senses: detail.senses.map((sense, index) => ({
        meaning: sense.meaning,
        notes: sense.notes,
        partsOfSpeech: entry.senses[index].partsOfSpeech
      })),
      ...(detail.pitch && pitch
        ? {
            pitch: {
              downstep: detail.pitch.downstep,
              levels: detail.pitch.morae.map(mora => (mora.high ? 'H' : 'L')).join(''),
              moraCount: detail.pitch.morae.length,
              particle: detail.pitch.particleHigh ? 'H' : 'L',
              source: pitch.sourceIdentity,
              graph: suitePitchGraph(detail.pitch)
            }
          }
        : {}),
      frequency: detail.frequencyRows.map(row => ({
        name: row.source,
        pack: defaultFrequencyPackIds[row.source],
        text: row.value,
        ...(row.tier ? { tier: tierLabels[row.tier] } : {}),
        details: suiteFrequencyDetails(row.details)
      })),
      alternativeForms: detail.alternatives.map(({ kind, labels, value }) => ({
        kind,
        labels,
        value
      })),
      kanji: kanji(detail.kanji),
      alternativeKanji: kanji(detail.alternativeKanji),
      relatedWords: detail.related.map(({ headword, reading, relation, summary, entSeq }) => ({
        headword,
        reading,
        relation,
        summary,
        ...(entSeq === null ? {} : { targetID: targetIds.get(entSeq) })
      })),
      examples: wordExamplesAsRecorded(
        entry.entSeq,
        word.rows.exampleCount,
        wordSuite.exampleLimit ?? 0,
        expected.examples
      )
    }
    expect(observed).toEqual(withoutFields(expected, ['covers', 'entSeq']))
    expect(
      detail.examples.map(example => example.text),
      "the page's first examples are the suite's"
    ).toEqual(
      expected.examples.shown.slice(0, detail.examples.length).map(example => example.japanese)
    )
    expect(
      related.filter(entSeq => !(entSeq in word.slugs)),
      'every related word links to its page'
    ).toEqual([])
  })

  test.each(kanjiSuite.cases)('kanji $codePoint $character: $covers', async expected => {
    const found = service.kanji(expected.character)
    if (!expected.opensDetail) {
      expect(found).toBeNull()
      return
    }
    expect(found, 'no kanji row').not.toBeNull()
    if (!found) return
    const { rows } = found
    const detail = kanjiDetail(rows)
    const ids = new Map(rows.words.map(word => [word.entSeq, word.id]))
    const suiteWord = (word: (typeof detail.words)[number]): SuiteWord => ({
      headword: word.headword,
      id: ids.get(word.entSeq) ?? '',
      reading: word.reading,
      summary: word.summary
    })
    const elementRows = new Map(rows.elements.map(element => [element.glyph, element]))
    const jlpt = detail.stats.find(stat => stat.label === 'JLPT')?.value
    const observed: Omit<KanjiCase, 'covers'> = {
      character: rows.kanji.character,
      codePoint: codePoint(rows.kanji.character),
      opensDetail: true,
      hasReference: true,
      strokeCount: rows.kanji.strokeCount,
      ...(rows.kanji.grade === null ? {} : { grade: rows.kanji.grade }),
      ...(jlpt === undefined ? {} : { jlpt }),
      meanings: detail.meanings,
      readings: detail.readings.map(({ kind, value, words }) => ({
        kind,
        value,
        words: words.map(suiteWord)
      })),
      words: detail.words.map(suiteWord),
      elements: detail.elements.map(({ character, role, description }) => {
        const element = elementRows.get(character)
        const meanings = element?.meanings.slice(0, meaningsShownPerElement) ?? []
        const linked = meanings.length === 0 ? (element?.commonLinkedOnReadings ?? []) : []
        expect(description, 'the page describes an element as KanjiElementsSection does').toBe(
          meanings.length > 0
            ? meanings.join(', ')
            : linked.length > 0
              ? `Linked on-readings: ${linked.join(', ')}`
              : ''
        )
        return {
          glyph: character,
          meanings,
          ...(linked.length > 0 ? { linkedOnReadings: linked } : {}),
          role
        }
      }),
      ...(detail.components.length > 0 ? { components: detail.components } : {}),
      hasStrokeOrder: detail.strokeOrder !== null,
      ...(detail.strokeOrder ? { strokeOrderStrokes: detail.strokeOrder.strokes.length } : {})
    }
    expect(observed).toEqual(withoutFields(expected, ['covers']))
    expect(
      detail.words.filter(word => !(word.entSeq in found.slugs)),
      'every listed word links to its page'
    ).toEqual([])
  })
})
