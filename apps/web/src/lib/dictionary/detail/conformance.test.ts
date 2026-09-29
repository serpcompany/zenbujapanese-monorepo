import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { type DictionaryWord, dictionaryDatabase } from '../dictionary-db'
import { wordSlug } from '../urls'
import { conjugationTable, indexedForms } from './conjugation'
import { appSectionTitles, type ElementKanji, kanjiElementDetail } from './element'
import { licenseUrl } from './examples'
import { tierLabels } from './frequency'
import { kanjiDetail } from './kanji'
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
} from './suite'
import { wordDetail } from './word'

// The word-detail, kanji-detail, and kanji-element-detail conformance suites, recorded from the app on the iOS
// Simulator (apps/ios/LanguageData/Conformance), replayed through the detail core against a local
// dictionary D1 built by `scripts/release-d1/load-local.sh dictionary` (at .dictionary-d1/, or
// ZENBU_DICTIONARY_D1_PATH). The import runs it before anything reaches D1, so it only runs when
// ZENBU_DICTIONARY_D1=1. It reads the database through dictionary-db.ts, as the pages do.
//
// Every example field is checked: the order, pair IDs, text, tokens, links, highlights, and counts
// (the import precomputes them, scripts/release-d1/dictionary/build-examples.mts). So are the
// headword's per-kanji furigana split, the pitch graph's points, and each Frequency row's details,
// in the shapes suite.ts shares with the rendered page's test (word-page.test.tsx), and the
// conjugation table the part of speech opens, form by form, with every example each form's screen
// lists (its pair IDs in order, and the first few's words, links, and accents), and that every
// word with a table is in the conjugations sitemap. The app's kanji cases don't record JLPT, so it
// isn't compared. Each element case is
// compared whole: its header, sections, alternative forms, texts, standalone kanji, the kanji
// containing it, and its sources.
const enabled = process.env.ZENBU_DICTIONARY_D1 === '1'

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

interface ElementKanjiCase {
  character: string
  meanings?: string
  readings?: string
}

interface ElementCase {
  element: string
  codePoint: string
  covers: string
  opensDetail: boolean
  found?: boolean
  meanings?: string
  sections?: string[]
  alternatives?: string[]
  meaningExplanation?: string
  soundPatterns?: string
  standaloneKanji?: ElementKanjiCase
  containingKanji?: ElementKanjiCase[]
  structureSource?: string
  metadataSource?: string
  sourceNote?: string
}

interface Suite<Case> {
  artifacts: Artifact[]
  cases: Case[]
  /** How many of each word's examples the suite records with their tokens. */
  exampleLimit?: number
  /** How many of each conjugated form's examples the suite records with their tokens. */
  formExampleLimit?: number
}

// Read only when the gate runs, so moving the files (#469) can't break `pnpm test`.
function readSuite<Case>(name: string): Suite<Case> {
  if (!enabled) return { artifacts: [], cases: [] }
  return JSON.parse(
    readFileSync(
      new URL(`../../../../../ios/LanguageData/Conformance/${name}.json`, import.meta.url),
      'utf8'
    )
  )
}

const wordSuite = readSuite<WordCase>('word-detail')
const kanjiSuite = readSuite<KanjiCase>('kanji-detail')
const elementSuite = readSuite<ElementCase>('kanji-element-detail')

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
  Array.from(
    character,
    scalar => `U+${(scalar.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`
  ).join(' ')

/** A kanji row as the element suite records it: nil fields are left out. */
const suiteElementKanji = ({ character, meanings, readings }: ElementKanji): ElementKanjiCase => ({
  character,
  ...(meanings === null ? {} : { meanings }),
  ...(readings === null ? {} : { readings })
})

describe.runIf(enabled)('word, kanji, and element detail conformance on D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<CloudflareEnv>>>
  let db: D1Database
  let dictionary: ReturnType<typeof dictionaryDatabase>

  beforeAll(async () => {
    proxy = await getPlatformProxy<CloudflareEnv>({
      persist: { path: `${process.env.ZENBU_DICTIONARY_D1_PATH ?? '.dictionary-d1'}/v3` }
    })
    const binding = proxy.env.DICTIONARY_DB
    if (!binding) throw new Error('wrangler.jsonc has no local DICTIONARY_DB binding')
    db = binding
    const loaded = await db
      .prepare('SELECT artifact, sha256, sources FROM dictionary_import')
      .first<{ artifact: string; sha256: string; sources: string }>()
      .catch(() => null)
    if (!loaded) {
      throw new Error(
        '.dictionary-d1 holds no import. Build it with scripts/release-d1/load-local.sh dictionary.'
      )
    }
    // Each suite pins the files it was recorded from; the build must have read the same ones.
    const sources: Record<string, string> = JSON.parse(loaded.sources)
    const built = (name: string) =>
      Object.entries(sources).find(([path]) => path.endsWith(`/Resources/${name}`))?.[1]
    const mismatched = [
      ...wordSuite.artifacts,
      ...kanjiSuite.artifacts,
      ...elementSuite.artifacts
    ].filter(
      artifact =>
        (artifact.name === loaded.artifact && artifact.sha256 !== loaded.sha256) ||
        (built(artifact.name) !== undefined && built(artifact.name) !== artifact.sha256)
    )
    if (mismatched.length > 0) {
      throw new Error(
        `.dictionary-d1 was built from other files than the suites pin: ${mismatched
          .map(artifact => `${artifact.name} (suite ${artifact.sha256})`)
          .join(', ')}. Rebuild it from those files, or record the suites again.`
      )
    }
    dictionary = dictionaryDatabase(db)
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  /** Language Reference IDs by `ent_seq`. */
  async function idsOf(entSeqs: number[]): Promise<Map<number, string>> {
    const ids = new Map<number, string>()
    // D1 binds at most 100 parameters per query.
    for (let start = 0; start < entSeqs.length; start += 100) {
      const batch = entSeqs.slice(start, start + 100)
      const { results } = await db
        .prepare(`SELECT ent_seq, id FROM words WHERE ent_seq IN (${batch.map(() => '?')})`)
        .bind(...batch)
        .all<{ ent_seq: number; id: string }>()
      for (const row of results) ids.set(row.ent_seq, row.id)
    }
    return ids
  }

  /**
   * A word's examples as the suite records them: the first `exampleLimit`, with each token's
   * entry (one link) or candidates (several) as Language Reference IDs, and the counts.
   */
  async function examples(
    entSeq: number,
    limit: number,
    recorded: SuiteExamples
  ): Promise<SuiteExamples> {
    const count = await db
      .prepare('SELECT listed, count, truncated FROM word_example_counts WHERE ent_seq = ?')
      .bind(entSeq)
      .first<{ listed: number; count: number; truncated: number }>()
    const found = await dictionary.examples(entSeq, 0, limit)
    if (!found) throw new Error(`No word ${entSeq}`)
    // When the app's retrieval throws (a headword that changes under NFKC, such as Ｈ), Word
    // Detail lists nothing, and so does the page: no count and no rows.
    if (recorded.error !== undefined && count === null && found.rows.length === 0) {
      return { listed: 0, truncated: false, error: recorded.error, shown: [] }
    }
    const ids = await idsOf([
      ...new Set(found.rows.flatMap(({ example }) => example.links.flatMap(link => link.entSeqs)))
    ])
    const id = (number: number) => ids.get(number) ?? `missing ${number}`
    return {
      listed: count?.listed ?? 0,
      reportedCount: count && count.count > 50 ? 'more than 50' : String(count?.count ?? 0),
      truncated: count?.truncated === 1,
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
  async function formExamples(surface: string, limit: number): Promise<SuiteFormExamples> {
    const found = await dictionary.formExamples(surface, 0, 100)
    expect(found.rows.length).toBe(found.listed)
    const shown = found.rows.slice(0, limit)
    const ids = await idsOf([
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
  async function conjugations(
    conjugations: SuiteConjugations,
    limit: number
  ): Promise<SuiteConjugations> {
    const withExamples = async (forms: SuiteConjugationForm[]) => {
      const result: SuiteConjugationForm[] = []
      for (const form of forms) {
        result.push({ ...form, examples: await formExamples(form.surface, limit) })
      }
      return result
    }
    return {
      ...conjugations,
      plain: await withExamples(conjugations.plain),
      ...(conjugations.polite ? { polite: await withExamples(conjugations.polite) } : {})
    }
  }

  test.each(wordSuite.cases)('word: $covers', async expected => {
    const word = (await dictionary.word(Number(expected.entSeq[0]))) as DictionaryWord
    expect(word, 'no word row').not.toBeNull()
    const { entry } = word.rows
    const detail = wordDetail(word.rows)
    const related = detail.related.flatMap(r => (r.entSeq === null ? [] : [r.entSeq]))
    const targetIds = await idsOf(related)
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
            conjugations: await conjugations(
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
      examples: await examples(entry.entSeq, wordSuite.exampleLimit ?? 0, expected.examples)
    }
    expect(observed).toEqual(covered(expected, ['covers', 'entSeq']))
    // The page's first examples are the suite's, from the same rows.
    expect(detail.examples.map(example => example.text)).toEqual(
      expected.examples.shown.slice(0, detail.examples.length).map(example => example.japanese)
    )
    // Every related word links to its page.
    expect(related.filter(entSeq => !word.relatedSlugs.has(entSeq))).toEqual([])
  })

  test.each(kanjiSuite.cases)('kanji $codePoint $character: $covers', async expected => {
    const found = await dictionary.kanji(expected.character)
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
    expect(detail.words.filter(word => !found.wordSlugs.has(word.entSeq))).toEqual([])
  })

  test('every word with a conjugation table is in the conjugations sitemap, with each form page that lists examples', async () => {
    const [{ results: rows }, { results: listed }, { results: surfaces }] = await Promise.all([
      db.prepare('SELECT ent_seq, headword, reading, parts_of_speech_json FROM words').all<{
        ent_seq: number
        headword: string
        reading: string
        parts_of_speech_json: string
      }>(),
      db
        .prepare('SELECT ent_seq, indexed_forms_json FROM word_conjugations')
        .all<{ ent_seq: number; indexed_forms_json: string }>(),
      db.prepare('SELECT DISTINCT surface FROM form_examples').all<{ surface: string }>()
    ])
    const withExamples = new Set(surfaces.map(row => row.surface))
    const expected = new Map<number, string[]>()
    for (const row of rows) {
      const table = conjugationTable({
        headword: row.headword,
        reading: row.reading,
        partsOfSpeech: JSON.parse(row.parts_of_speech_json)
      })
      if (table)
        expected.set(
          row.ent_seq,
          indexedForms(table, surface => withExamples.has(surface))
        )
    }
    expect(expected.size).toBeGreaterThan(0)
    const stored = new Map(listed.map(row => [row.ent_seq, JSON.parse(row.indexed_forms_json)]))
    const differing = [...new Set([...expected.keys(), ...stored.keys()])].filter(
      entSeq => JSON.stringify(expected.get(entSeq)) !== JSON.stringify(stored.get(entSeq))
    )
    expect(differing.slice(0, 10)).toEqual([])
  })

  test.each(elementSuite.cases)('element $codePoint $element: $covers', async expected => {
    const found = await dictionary.element(expected.element)
    // A glyph that isn't an element has no page; the app shows No Element Reference for it.
    if (!expected.opensDetail || !expected.found) {
      expect(found).toBeNull()
      return
    }
    expect(found, 'no element row').not.toBeNull()
    if (!found) return
    const detail = kanjiElementDetail(found.rows)
    const observed: Omit<ElementCase, 'covers'> = {
      element: detail.glyph,
      codePoint: codePoint(detail.glyph),
      opensDetail: true,
      found: true,
      ...(detail.meanings === null ? {} : { meanings: detail.meanings }),
      sections: detail.sections.map(section => appSectionTitles[section]),
      alternatives: detail.alternatives,
      ...(detail.meaningExplanation === null
        ? {}
        : { meaningExplanation: detail.meaningExplanation }),
      ...(detail.soundPatterns === null ? {} : { soundPatterns: detail.soundPatterns }),
      ...(detail.standaloneKanji
        ? { standaloneKanji: suiteElementKanji(detail.standaloneKanji) }
        : {}),
      containingKanji: detail.containingKanji.map(suiteElementKanji),
      structureSource: detail.structureSource,
      metadataSource: detail.metadataSource,
      sourceNote: detail.sourceNote
    }
    expect(observed).toEqual(covered(expected, ['covers']))
    // Search engines index an element with meanings or linked on-readings.
    expect(detail.indexable).toBe(detail.meanings !== null || detail.soundPatterns !== null)
  })

  test('every element a kanji lists has a page', async () => {
    const { results } = await db
      .prepare(
        `SELECT DISTINCT g.value AS glyph FROM kanji_elements e, json_each(e.element_glyphs_json) g
         WHERE g.value NOT IN (SELECT glyph FROM element_glyphs)`
      )
      .all<{ glyph: string }>()
    expect(results).toEqual([])
  })

  test('every word is stored under the slug its URL uses', async () => {
    const { results } = await db
      .prepare('SELECT ent_seq, headword, reading, slug FROM words')
      .all<{ ent_seq: number; headword: string; reading: string; slug: string }>()
    expect(results.length).toBeGreaterThan(0)
    const wrong = results.filter(row => row.slug !== wordSlug(row.headword, row.reading))
    expect(wrong.slice(0, 10)).toEqual([])
  })
})
