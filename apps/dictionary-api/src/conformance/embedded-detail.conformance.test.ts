import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import { entriesById } from '@zenbu/dictionary-core/artifact/words'
import { tierLabels } from '@zenbu/dictionary-core/detail/frequency'
import type {
  KanjiElementContribution,
  KanjiElementDetail
} from '@zenbu/dictionary-core/detail/kanji-element'
import {
  type SuiteConjugationForm,
  type SuiteConjugations,
  suiteConjugations,
  suiteFrequencyDetails,
  suiteFurigana,
  suitePitchGraph
} from '@zenbu/dictionary-core/detail/suite'
import { isKanjiCharacter } from '@zenbu/dictionary-core/detail/text'
import type {
  EmbeddedKanjiPage,
  EmbeddedWordPage
} from '@zenbu/dictionary-core/embedded/presentation'
import type { EmbeddedExamples } from '@zenbu/dictionary-core/embedded/text'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  codePoint,
  codePoints,
  type KanjiCase,
  type KanjiElementCase,
  kanjiElementSuite,
  kanjiSuite,
  type SuiteExamples,
  type SuiteWord,
  type WordCase,
  withoutFields,
  wordSuite
} from './detail-suite'
import {
  type Embedded,
  type EmbeddedSentence,
  embedded,
  entryAsTheAppReadsIt,
  shownAsTheAppLinks
} from './embedded-support'
import { artifactAvailable, artifactDatabase, requirePinnedArtifacts } from './support'

const errorsAsTheAppNamesThem: Record<string, string> = {
  missingEntryEvidence:
    'invalidQuery(SearchExperience.ExampleSentenceInvalidQueryReason.missingEntryEvidence)'
}

describe.runIf(artifactAvailable)('the app’s word and kanji pages on the artifact', () => {
  let app: Embedded
  let db: ArtifactDatabase

  beforeAll(async () => {
    requirePinnedArtifacts([
      ...wordSuite.artifacts,
      ...kanjiSuite.artifacts,
      ...kanjiElementSuite.artifacts
    ])
    app = await embedded()
    db = await artifactDatabase()
  })

  async function examplesAsRecorded(id: string, headword: string): Promise<SuiteExamples> {
    let found: EmbeddedExamples
    try {
      found = await app.text<EmbeddedExamples>('entryExamples', id)
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error)
      return {
        listed: 0,
        truncated: false,
        error: errorsAsTheAppNamesThem[code] ?? code,
        shown: []
      }
    }
    return {
      listed: found.sentences.length,
      reportedCount: found.count > 50 ? 'more than 50' : String(found.count),
      truncated: found.truncated,
      shown: await shownAsTheAppLinks(
        app,
        found.sentences.slice(0, wordSuite.exampleLimit ?? 0),
        { query: headword, highlightedEntry: id },
        'pageWord'
      )
    }
  }

  async function withFormExamples(forms: SuiteConjugationForm[]): Promise<SuiteConjugationForm[]> {
    const withExamples: SuiteConjugationForm[] = []
    for (const form of forms) {
      const sentences = await app.text<EmbeddedSentence[]>('formExamples', form.surface)
      withExamples.push({
        ...form,
        examples: {
          ids: sentences.map(sentence => sentence.id),
          shown: await shownAsTheAppLinks(
            app,
            sentences.slice(0, wordSuite.formExampleLimit ?? 0),
            { query: form.surface, highlightedEntry: null },
            'highlighted'
          )
        }
      })
    }
    return withExamples
  }

  async function conjugationsAsRecorded(recorded: SuiteConjugations): Promise<SuiteConjugations> {
    return {
      ...recorded,
      plain: await withFormExamples(recorded.plain),
      ...(recorded.polite ? { polite: await withFormExamples(recorded.polite) } : {})
    }
  }

  test.each(wordSuite.cases)('shows the word as the suite records: $covers', async expected => {
    const id = expected.languageReferenceID
    const entry = entryAsTheAppReadsIt(db, id)
    if (!entry) throw new Error(`The artifact has no entry ${id}`)
    const page = await app.presentation<EmbeddedWordPage>('wordPage', entry)
    const kanji = async (characters: string[]) => {
      const listed = []
      for (const character of characters) {
        listed.push({
          character,
          meanings: await app.presentation<string[]>('kanjiMeanings', character)
        })
      }
      return listed
    }
    const observed: Omit<WordCase, 'covers' | 'entSeq'> = {
      id,
      languageReferenceID: id,
      headword: entry.headword,
      reading: entry.reading,
      furigana: suiteFurigana(page.ruby),
      partOfSpeech: page.partOfSpeech,
      opensConjugations: page.conjugations !== null,
      ...(page.conjugations
        ? {
            conjugations: await conjugationsAsRecorded(
              suiteConjugations(page.conjugations, entry.summary)
            )
          }
        : {}),
      senses: page.senses.map((sense, index) => ({
        meaning: sense.meaning,
        notes: sense.notes,
        partsOfSpeech: entry.senses[index].partsOfSpeech
      })),
      ...(page.pitch
        ? {
            pitch: {
              downstep: page.pitch.downstep,
              levels: page.pitch.morae.map(mora => (mora.high ? 'H' : 'L')).join(''),
              moraCount: page.pitch.moraCount,
              particle: page.pitch.particleHigh ? 'H' : 'L',
              source: page.pitch.source,
              graph: suitePitchGraph(page.pitch)
            }
          }
        : {}),
      frequency: page.frequency.map(row => ({
        name: row.source,
        pack: row.pack ?? '',
        text: row.value,
        ...(row.tier ? { tier: tierLabels[row.tier] } : {}),
        details: suiteFrequencyDetails(row.details)
      })),
      alternativeForms: page.alternatives.map(({ kind, labels, value }) => ({
        kind,
        labels,
        value
      })),
      kanji: await kanji(page.kanji),
      alternativeKanji: await kanji(page.alternativeKanji),
      relatedWords: page.related.map(({ headword, reading, relation, summary }, index) => {
        const targetID = (entry.relationships[index] as { targetID?: string | null }).targetID
        return { headword, reading, relation, summary, ...(targetID ? { targetID } : {}) }
      }),
      examples: await examplesAsRecorded(id, entry.headword)
    }
    expect(observed).toEqual(withoutFields(expected, ['covers', 'entSeq']))
    for (const mode of page.conjugations?.modes ?? []) {
      for (const row of page.conjugations?.rows[mode] ?? []) {
        expect(row.note === null, `${row.title} has a note only beside same-spelled forms`).toBe(
          row.sharedSpellings.length === 0
        )
      }
    }
  })

  test.each(
    kanjiSuite.cases
  )('shows the kanji $codePoint $character as the suite records: $covers', async expected => {
    const { character } = expected
    if (!expected.opensDetail) {
      expect(isKanjiCharacter(character)).toBe(false)
      return
    }
    expect(isKanjiCharacter(character)).toBe(true)
    const ids = await app.lookup<string[]>('entriesContainingKanji', character)
    const entries = entriesById(db, ids)
    const words = ids.map(id => {
      const { headword, reading, summary } = entries.get(id) ?? {
        headword: '',
        reading: '',
        summary: ''
      }
      return { id, headword, reading, summary }
    })
    const page = await app.presentation<EmbeddedKanjiPage>('kanjiPage', {
      character,
      words,
      leadingWord: null
    })
    const stat = (kind: string) => page.stats.find(found => found.kind === kind)?.value
    const suiteWord = ({ headword, id, reading, summary }: SuiteWord): SuiteWord => ({
      headword,
      id,
      reading,
      summary
    })
    const grade = stat('grade')
    const jlpt = stat('jlpt')
    const observed: Omit<KanjiCase, 'covers' | 'hasStrokeOrder' | 'strokeOrderStrokes'> = {
      character: page.character,
      codePoint: codePoint(page.character),
      opensDetail: true,
      hasReference: page.hasReference,
      ...(page.hasReference
        ? {
            strokeCount: Number(stat('strokes')),
            ...(grade === undefined ? {} : { grade: Number(grade) }),
            ...(jlpt === undefined ? {} : { jlpt }),
            meanings: page.meanings,
            readings: page.readings.map(({ kind, value, words: matching }) => ({
              kind,
              value,
              words: matching.map(suiteWord)
            })),
            ...(page.components.length > 0 ? { components: page.components } : {})
          }
        : {}),
      words: page.words.map(suiteWord),
      elements: page.elements.map(({ character: glyph, role, meanings, linkedOnReadings }) => ({
        glyph,
        role,
        meanings,
        ...(meanings.length > 0 ? {} : { linkedOnReadings })
      }))
    }
    expect(observed).toEqual(
      withoutFields(expected, ['covers', 'hasStrokeOrder', 'strokeOrderStrokes'])
    )
    for (const element of page.elements) {
      expect(element.description).toBe(
        element.meanings.length > 0
          ? element.meanings.join(', ')
          : element.linkedOnReadings.length > 0
            ? `Linked on-readings: ${element.linkedOnReadings.join(', ')}`
            : ''
      )
      expect(element.spoken).toBe(
        `Element ${element.character}, ${element.roleLabel.toLowerCase()}, ${element.meanings.join(', ')}`
      )
    }
  })

  test.each(
    kanjiElementSuite.cases
  )('shows the element $codePoint $glyph as the suite records: $covers', async expected => {
    const { glyph } = expected
    const page = await app.presentation<KanjiElementDetail | null>('kanjiElementPage', glyph)
    const kanji = ({ character, meanings, onReadings, spoken }: KanjiElementContribution) => ({
      character,
      codePoint: codePoints(character),
      meanings,
      onReadings,
      spoken
    })
    const observed: Omit<KanjiElementCase, 'covers'> = {
      glyph,
      codePoint: codePoints(glyph),
      opensDetail: isKanjiCharacter(glyph),
      ...(isKanjiCharacter(glyph) ? { hasPage: page !== null } : {}),
      ...(page
        ? {
            meanings: page.meanings,
            ...(page.explanation === null ? {} : { explanation: page.explanation }),
            ...(page.soundPatterns === null ? {} : { soundPatterns: page.soundPatterns }),
            alternatives: page.alternatives,
            alternativeCodePoints: page.alternatives.map(codePoints),
            ...(page.standalone ? { standalone: kanji(page.standalone) } : {}),
            containing: page.containing.map(kanji),
            structureSource: page.structureSource,
            metadataSource: page.metadataSource
          }
        : {})
    }
    expect(observed).toEqual(withoutFields(expected, ['covers']))
  })

  test('puts the word a kanji page was opened from first among its words', async () => {
    const ids = await app.lookup<string[]>('entriesContainingKanji', '日')
    const entries = entriesById(db, ids)
    const words = ids.map(id => ({
      id,
      headword: '',
      reading: '',
      summary: '',
      ...entries.get(id)
    }))
    const page = await app.presentation<EmbeddedKanjiPage>('kanjiPage', {
      character: '日',
      words,
      leadingWord: ids[5]
    })
    expect(page.words.map(word => word.id)).toEqual([ids[5], ...ids.filter(id => id !== ids[5])])
  })
})
