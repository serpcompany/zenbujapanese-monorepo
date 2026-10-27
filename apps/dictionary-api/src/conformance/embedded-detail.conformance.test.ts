import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import { entriesById, slugsByEntSeq } from '@zenbu/dictionary-core/artifact/words'
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
import type {
  EmbeddedEntryExamples,
  EmbeddedExample,
  EmbeddedExamplePage,
  EmbeddedMeaningExample
} from '@zenbu/dictionary-core/embedded/text'
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
  embedded,
  entryAsTheAppReadsIt,
  everyPage,
  shownAsTheAppLinks
} from './embedded-support'
import { artifactAvailable, artifactDatabase, requirePinnedArtifacts } from './support'

const websiteOrigin = 'https://zenbujapanese.com'

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

  async function examplesAsRecorded(id: string): Promise<SuiteExamples> {
    const shown = wordSuite.exampleLimit ?? 0
    let listed: { first: EmbeddedEntryExamples; examples: EmbeddedExample[] }
    try {
      listed = await everyPage(
        from => app.text<EmbeddedEntryExamples>('entryExamples', { id, from }),
        shown
      )
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error)
      return {
        listed: 0,
        truncated: false,
        error: errorsAsTheAppNamesThem[code] ?? code,
        shown: []
      }
    }
    const { first: found, examples } = listed
    return {
      listed: found.listed,
      reportedCount: found.count > 50 ? 'more than 50' : String(found.count),
      truncated: found.truncated,
      shown: shownAsTheAppLinks(examples.slice(0, shown), 'pageWord')
    }
  }

  async function withFormExamples(forms: SuiteConjugationForm[]): Promise<SuiteConjugationForm[]> {
    const withExamples: SuiteConjugationForm[] = []
    for (const form of forms) {
      const { examples } = await everyPage(from =>
        app.text<EmbeddedExamplePage>('formExamples', { form: form.surface, from })
      )
      withExamples.push({
        ...form,
        examples: {
          ids: examples.map(example => example.id),
          shown: shownAsTheAppLinks(
            examples.slice(0, wordSuite.formExampleLimit ?? 0),
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
    const meaningExamples = new Map(
      (await app.text<EmbeddedMeaningExample[]>('meaningExamples', { id })).map(
        ({ number, example }) => [number, shownAsTheAppLinks([example], 'pageWord')[0]]
      )
    )
    const kanji = async (characters: string[]) => {
      const listed = []
      for (const character of characters) {
        const { meanings } = await app.presentation<EmbeddedKanjiPage>('kanjiPage', {
          character,
          words: [],
          leadingWord: null
        })
        listed.push({ character, meanings })
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
      senses: page.senses.map((sense, index) => {
        const example = meaningExamples.get(sense.number)
        return {
          meaning: sense.meaning,
          glosses: entry.senses[index].glosses,
          notes: sense.notes,
          partsOfSpeech: entry.senses[index].partsOfSpeech,
          ...(example ? { example } : {})
        }
      }),
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
      examples: await examplesAsRecorded(id)
    }
    expect(observed).toEqual(withoutFields(expected, ['covers', 'entSeq']))
    const entSeq = Number(expected.entSeq[0])
    const slug = slugsByEntSeq(db, [entSeq]).get(entSeq)
    expect(page.shareURL, 'Share sends the page the website serves the word at').toBe(
      `${websiteOrigin}${encodeURI(`/dictionary/${slug}-${entSeq}/`)}`
    )
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
            readings: page.readings.map(({ kind, value, spoken, words: matching }) => ({
              kind,
              value,
              ...(spoken === null ? {} : { spoken }),
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

  test.each([
    { entSeq: '1980230', lookUp: ['Ministry of Health, Labour and Welfare', 'MHLW'] },
    { entSeq: '1335140', lookUp: ['100,000', 'hundred thousand'] }
  ])('offers JMdict $entSeq’s glosses whole, as the entry gives them', async ({
    entSeq,
    lookUp
  }) => {
    const [row] = db.all<{ id: string }>(
      `SELECT lower(hex(id)) AS id FROM entries
       WHERE source_identity = 'edrdg.jmdict' AND source_record_id = ?`,
      [Number(entSeq)]
    )
    const entry = row && entryAsTheAppReadsIt(db, row.id)
    if (!entry) throw new Error(`The artifact has no JMdict entry ${entSeq}`)
    const [sense] = (await app.presentation<EmbeddedWordPage>('wordPage', entry)).senses
    expect({ glosses: sense.glosses, spoken: sense.spoken }).toEqual({
      glosses: lookUp,
      spoken: lookUp.join(', ')
    })
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
