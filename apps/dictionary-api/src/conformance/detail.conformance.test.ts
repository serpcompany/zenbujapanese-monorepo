import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import type { Dictionary, WordResponse } from '@zenbu/dictionary-core/artifact/dictionary'
import { licenseUrl } from '@zenbu/dictionary-core/detail/examples'
import { tierLabels } from '@zenbu/dictionary-core/detail/frequency'
import { kanjiDetail } from '@zenbu/dictionary-core/detail/kanji'
import type { ExampleCountRow } from '@zenbu/dictionary-core/detail/rows'
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
import {
  artifactAvailable,
  artifactDatabase,
  dictionary,
  readSuite,
  requirePinnedArtifacts
} from './support'

// The word-detail and kanji-detail suites (word-detail.json, kanji-detail.json,
// WordDetailConformanceTests.swift and KanjiDetailConformanceTests.swift), replayed through the
// detail core on what the service answers for each word and kanji page, read from the artifact
// when asked. Every example field is checked: the order, pair IDs, text, tokens, links,
// highlights, and counts. So are the headword's per-kanji furigana split, the pitch graph's
// points, each Frequency row's details, in the shapes suite.ts shares with the rendered page's
// test (word-page.test.tsx), and the conjugation table the part of speech opens, form by form,
// with every example each form's screen lists (its pair IDs in order, and the first few's words,
// links, and accents). The app's kanji cases don't record JLPT, so it isn't compared.

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
  meanings?: string[]
  readings?: { kind: string; value: string; words: SuiteWord[] }[]
  words?: SuiteWord[]
  elements?: { glyph: string; meanings: string[]; linkedOnReadings?: string[]; role: string }[]
  components?: string[]
}

interface Suite<Case> {
  artifacts: Artifact[]
  cases: Case[]
  /** How many of each word's examples the suite records with their tokens. */
  exampleLimit?: number
  /** How many of each conjugated form's examples the suite records with their tokens. */
  formExampleLimit?: number
}

const wordSuite = readSuite<Suite<WordCase>>('word-detail')
const kanjiSuite = readSuite<Suite<KanjiCase>>('kanji-detail')

/** The app's pack IDs for the website's default frequency dictionaries, by short name. */
const packIds: Record<string, string> = {
  JLPT: 'zenbu.jlpt.waller.levels',
  YouTube: 'zenbu.tubelex.youtube.ja.unidic-3.1'
}

/** The suite's fields, without those this import doesn't cover. */
function covered<Case extends object>(expected: Case, skipped: string[]): Partial<Case> {
  return Object.fromEntries(
    Object.entries(expected).filter(([key]) => !skipped.includes(key))
  ) as Partial<Case>
}

const codePoint = (character: string) =>
  `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`

describe.runIf(artifactAvailable)('word and kanji detail conformance', () => {
  let service: Dictionary
  let db: ArtifactDatabase

  beforeAll(async () => {
    requirePinnedArtifacts([...wordSuite.artifacts, ...kanjiSuite.artifacts])
    service = await dictionary({ morphology: false })
    db = await artifactDatabase()
  })

  /** Language Reference IDs by `ent_seq`. */
  function idsOf(entSeqs: number[]): Map<number, string> {
    if (entSeqs.length === 0) return new Map()
    const rows = db.all<{ ent_seq: number; id: string }>(
      `SELECT source_record_id AS ent_seq, lower(hex(id)) AS id FROM entries
       WHERE source_identity = 'edrdg.jmdict' AND source_record_id IN (${entSeqs.map(() => '?')})`,
      entSeqs
    )
    return new Map(rows.map(row => [row.ent_seq, row.id]))
  }

  /**
   * A word's examples as the suite records them: the first `exampleLimit`, with each token's
   * entry (one link) or candidates (several) as Language Reference IDs, and the counts.
   */
  function examples(
    entSeq: number,
    count: ExampleCountRow | null,
    limit: number,
    recorded: SuiteExamples
  ): SuiteExamples {
    const found = service.wordExamples(entSeq, 0, limit)
    if (!found) throw new Error(`No word ${entSeq}`)
    // When the app's retrieval throws (a headword that changes under NFKC, such as Ｈ), Word
    // Detail lists nothing, and so does the page: no count and no rows.
    if (recorded.error !== undefined && count === null && found.rows.length === 0) {
      return { listed: 0, truncated: false, error: recorded.error, shown: [] }
    }
    const ids = idsOf([
      ...new Set(found.rows.flatMap(({ example }) => example.links.flatMap(link => link.entSeqs)))
    ])
    const id = (number: number) => ids.get(number) ?? `missing ${number}`
    return {
      listed: count?.listed ?? 0,
      reportedCount: count && count.count > 50 ? 'more than 50' : String(count?.count ?? 0),
      truncated: count?.truncated ?? false,
      shown: found.rows.map(({ sentence, example }) => {
        // The suite doesn't record attribution; each side must still have its own, read intact.
        for (const side of ['japanese', 'english'] as const) {
          expect(Number.isInteger(sentence[`${side}TatoebaId`])).toBe(true)
          expect(licenseUrl(sentence[`${side}License`])).not.toBeNull()
          expect([null, 'string']).toContain(
            sentence[`${side}Contributor`] === null ? null : typeof sentence[`${side}Contributor`]
          )
        }
        const links = new Map(example.links.map(link => [link.token, link.entSeqs]))
        const highlights = new Set(example.highlights)
        return {
          id: `esp1_${sentence.pairId}`,
          japanese: sentence.japanese,
          english: sentence.english,
          tokens: (example.tokens ?? sentence.tokens).map((token, index): SuiteToken => {
            const entSeqs = links.get(index) ?? []
            return {
              surface: token.text,
              ...(entSeqs.length === 1 ? { entry: id(entSeqs[0]) } : {}),
              ...(entSeqs.length > 1 ? { candidates: entSeqs.map(id) } : {}),
              ...(highlights.has(index) ? { pageWord: true } : {})
            }
          })
        }
      })
    }
  }

  /**
   * A conjugated form's examples as the suite records them: every pair ID the form's screen lists,
   * in order, and the first `limit` with each word's entry or candidates, and whether it's
   * accented.
   */
  function formExamples(surface: string, limit: number): SuiteFormExamples {
    const found = service.formExamples(surface, 0, 100)
    expect(found.rows.length).toBe(found.listed)
    const shown = found.rows.slice(0, limit)
    const ids = idsOf([
      ...new Set(shown.flatMap(({ example }) => example.links.flatMap(link => link.entSeqs)))
    ])
    const id = (number: number) => ids.get(number) ?? `missing ${number}`
    return {
      ids: found.rows.map(({ sentence }) => `esp1_${sentence.pairId}`),
      shown: shown.map(({ sentence, example }) => {
        const links = new Map(example.links.map(link => [link.token, link.entSeqs]))
        const highlights = new Set(example.highlights)
        return {
          id: `esp1_${sentence.pairId}`,
          japanese: sentence.japanese,
          english: sentence.english,
          tokens: sentence.tokens.map((token, index) => {
            const entSeqs = links.get(index) ?? []
            return {
              surface: token.text,
              ...(entSeqs.length === 1 ? { entry: id(entSeqs[0]) } : {}),
              ...(entSeqs.length > 1 ? { candidates: entSeqs.map(id) } : {}),
              ...(highlights.has(index) ? { highlighted: true } : {})
            }
          })
        }
      })
    }
  }

  /** The table as the suite records it, with each form's examples. */
  function conjugations(conjugations: SuiteConjugations, limit: number): SuiteConjugations {
    const withExamples = (forms: SuiteConjugationForm[]) =>
      forms.map(form => ({ ...form, examples: formExamples(form.surface, limit) }))
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
    const targetIds = idsOf(related)
    const glosses = new Map(word.rows.kanji.map(gloss => [gloss.character, gloss.meanings]))
    const kanji = (list: typeof detail.kanji) =>
      list.map(({ character, meaning }) => {
        const meanings = glosses.get(character) ?? []
        // The page shows the first two meanings.
        expect(meaning).toBe(meanings.length > 0 ? meanings.slice(0, 2).join(', ') : null)
        return { character, meanings }
      })
    const pitch = entry.pitch ?? entry.compoundPitch
    const observed: Omit<WordCase, 'covers' | 'entSeq'> = {
      id: entry.id,
      languageReferenceID: entry.id,
      headword: detail.headword,
      reading: detail.reading,
      // With each kanji run's per-kanji split, which the headword's highlight uses.
      furigana: suiteFurigana(detail.ruby),
      partOfSpeech: detail.partOfSpeech,
      opensConjugations: detail.conjugations !== null,
      ...(detail.conjugations
        ? {
            conjugations: conjugations(
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
              // The dot-and-line contour the word card draws.
              graph: suitePitchGraph(detail.pitch)
            }
          }
        : {}),
      frequency: detail.frequencyRows.map(row => ({
        name: row.source,
        pack: packIds[row.source],
        text: row.value,
        ...(row.tier ? { tier: tierLabels[row.tier] } : {}),
        // What the row opens: Frequency Details.
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
      examples: examples(
        entry.entSeq,
        word.rows.exampleCount,
        wordSuite.exampleLimit ?? 0,
        expected.examples
      )
    }
    expect(observed).toEqual(covered(expected, ['covers', 'entSeq']))
    // The page's first examples are the suite's, from the same rows.
    expect(detail.examples.map(example => example.text)).toEqual(
      expected.examples.shown.slice(0, detail.examples.length).map(example => example.japanese)
    )
    // Every related word links to its page.
    expect(related.filter(entSeq => !(entSeq in word.slugs))).toEqual([])
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
    const observed: Omit<KanjiCase, 'covers'> = {
      character: rows.kanji.character,
      codePoint: codePoint(rows.kanji.character),
      opensDetail: true,
      hasReference: true,
      strokeCount: rows.kanji.strokeCount,
      ...(rows.kanji.grade === null ? {} : { grade: rows.kanji.grade }),
      meanings: detail.meanings,
      readings: detail.readings.map(({ kind, value, words }) => ({
        kind,
        value,
        words: words.map(suiteWord)
      })),
      words: detail.words.map(suiteWord),
      // The app records what KanjiElementsSection shows: up to three meanings, else the
      // element's linked on-readings. The page shows the same, as `description`.
      elements: detail.elements.map(({ character, role, description }) => {
        const element = elementRows.get(character)
        const meanings = element?.meanings.slice(0, 3) ?? []
        const linked = meanings.length === 0 ? (element?.commonLinkedOnReadings ?? []) : []
        expect(description).toBe(
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
      // The stroke-order control shows only for a kanji with a diagram, as the app's does.
      hasStrokeOrder: detail.strokeOrder !== null,
      ...(detail.strokeOrder ? { strokeOrderStrokes: detail.strokeOrder.strokes.length } : {})
    }
    expect(observed).toEqual(covered(expected, ['covers']))
    expect(found.indexable).toBe(detail.meanings.length > 0 || detail.readings.length > 0)
    // Every listed word links to its page.
    expect(detail.words.filter(word => !(word.entSeq in found.slugs))).toEqual([])
  })
})
