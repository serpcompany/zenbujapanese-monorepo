import { describe, expect, test } from 'vitest'
import type { KanjiElementFile, KanjiReferenceFile } from '../artifact/kanji-data'
import { ask } from './fake-host'
import type { EmbeddedHost } from './host'
import type { EmbeddedEntry, EmbeddedKanjiPage, EmbeddedWordPage } from './presentation'

function kanji(
  character: string,
  readings: [string, 'on' | 'kun' | 'name'][],
  extra: Partial<KanjiReferenceFile['entries'][number]> = {}
): KanjiReferenceFile['entries'][number] {
  return {
    character,
    strokeCount: 8,
    grade: 1,
    wallerJlptLevel: 5,
    frequencyRank: 1,
    meanings: [`${character} meaning`, 'second', 'third'],
    readings: readings.map(([value, kind]) => ({ value, kind })),
    components: ['子', '冖'],
    ...extra
  }
}

const reference: KanjiReferenceFile = {
  metadataSourceIdentity: 'edrdg.kanjidic2',
  componentSourceIdentity: 'edrdg.kradfile',
  entries: [
    kanji('学', [
      ['ガク', 'on'],
      ['まな.ぶ', 'kun']
    ]),
    kanji(
      '校',
      [
        ['コウ', 'on'],
        ['キョウ', 'on'],
        ['たかし', 'name']
      ],
      { strokeCount: 1, grade: null, wallerJlptLevel: null }
    ),
    kanji('食', [
      ['ショク', 'on'],
      ['た.べる', 'kun'],
      ['く.う', 'kun']
    ])
  ]
}

const elements: KanjiElementFile = {
  schema: 'zenbu.kanji-elements.v1',
  kanji: [
    {
      character: '校',
      meanings: [],
      onReadings: ['コウ'],
      frequencyRank: null,
      elementGlyphs: ['木', '交', '父'],
      explicitPhoneticElement: '交'
    }
  ],
  elements: [
    {
      glyph: '木',
      alternatives: [],
      meanings: ['tree', 'wood', 'timber', 'plank'],
      onReadings: [],
      commonLinkedOnReadings: [],
      containingCharacters: ['校', '森']
    },
    {
      glyph: '交',
      alternatives: ['校'],
      meanings: [],
      onReadings: ['コウ'],
      commonLinkedOnReadings: ['コウ'],
      containingCharacters: ['校']
    },
    {
      glyph: '父',
      alternatives: [],
      meanings: [],
      onReadings: ['フ'],
      commonLinkedOnReadings: ['コウ', 'フ'],
      containingCharacters: []
    }
  ]
}

const elementSources = {
  snapshot: '8a0c',
  structureSourceIdentity: 'kanjium',
  metadataSourceIdentity: 'edrdg.kanjidic2',
  metadataSourceSnapshot: '2026-10-05'
}

const host: EmbeddedHost = {
  kanjiSources: () => ({ ...reference, schema: elements.schema, elements: elementSources }),
  kanjiEntry: character => reference.entries.find(entry => entry.character === character) ?? null,
  kanjiStructure: character => elements.kanji.find(entry => entry.character === character) ?? null,
  kanjiElement: glyph => elements.elements.find(entry => entry.glyph === glyph) ?? null
}

const eat: EmbeddedEntry = {
  id: 'e1',
  headword: '食べる',
  reading: 'たべる',
  summary: 'to eat',
  partsOfSpeech: ['ichidanVerb', 'transitive'],
  writtenForms: [
    { value: '食べる', kind: 'written', labels: [] },
    { value: '喰べる', kind: 'written', labels: ['rare'] },
    { value: '食る', kind: 'written', labels: ['Search only'] }
  ],
  readingForms: [{ value: 'たべる', kind: 'reading', labels: [] }],
  senses: [
    { meaning: 'to eat', notes: [], partsOfSpeech: ['ichidanVerb', 'transitive'] },
    { meaning: 'to live on', notes: ['e.g. a salary'], partsOfSpeech: [] }
  ],
  relationships: [
    { headword: '学校', reading: 'がっこう', summary: 'school', relation: 'See also' }
  ],
  pitch: { downstep: 2, moraCount: 3, sourceIdentity: 'unidic' }
}

describe('the embedded presentation engine', () => {
  test('splits a word’s reading over its kanji, kanji by kanji where only one split fits', async () => {
    expect(await ask(host, 'ruby', JSON.stringify(['学校', 'がっこう']))).toEqual([
      { text: '学校', reading: 'がっこう', kanjiReadings: ['がっ', 'こう'] }
    ])
    expect(await ask(host, 'ruby', JSON.stringify(['食べる', 'たべる']))).toEqual([
      { text: '食', reading: 'た' },
      { text: 'べる' }
    ])
    expect(await ask(host, 'ruby', JSON.stringify(['かな', 'かな']))).toEqual([{ text: 'かな' }])
  })

  test('says so when its host has no kanji files, and refuses files it does not read', async () => {
    const pair = JSON.stringify(['学校', 'がっこう'])
    await expect(ask({}, 'ruby', pair)).rejects.toThrow('The host has no kanji files to read')
    await expect(ask({ kanjiSources: () => null }, 'ruby', pair)).rejects.toThrow(
      'The host has no kanji files to read'
    )
    const other = {
      ...host,
      kanjiSources: () => ({
        ...reference,
        schema: 'zenbu.kanji-elements.v9',
        elements: elementSources
      })
    }
    await expect(ask(other, 'ruby', pair)).rejects.toThrow(
      'KanjiElementReferenceData.json is zenbu.kanji-elements.v9'
    )
  })

  test('reads a word whose kanji the files do not hold without splitting its reading', async () => {
    expect(await ask(host, 'ruby', JSON.stringify(['猫舌', 'ねこじた']))).toEqual([
      { text: '猫舌', reading: 'ねこじた' }
    ])
  })

  test('builds a word page from the entry the host read', async () => {
    const page = (await ask(host, 'wordPage', JSON.stringify(eat))) as EmbeddedWordPage
    expect(page.ruby).toEqual([{ text: '食', reading: 'た' }, { text: 'べる' }])
    expect(page.partOfSpeech).toBe('Ichidan verb (transitive)')
    expect(page.senses).toEqual([
      { number: 1, meaning: 'to eat', notes: [] },
      { number: 2, meaning: 'to live on', notes: ['e.g. a salary'] }
    ])
    expect(page.alternatives).toEqual([
      { value: '喰べる', kind: 'written', labels: ['rare'], kanji: '喰' }
    ])
    expect(page.kanji).toEqual(['食'])
    expect(page.alternativeKanji).toEqual(['喰'])
    expect(page.related).toEqual([
      {
        headword: '学校',
        reading: 'がっこう',
        ruby: [{ text: '学校', reading: 'がっこう' }],
        relation: 'See also',
        summary: 'school',
        entSeq: null
      }
    ])
    expect(page.shareText).toBe('食べる【たべる】\n1. to eat\n2. to live on')
    expect(page.pitch).toMatchObject({
      downstep: 2,
      moraCount: 3,
      particleHigh: false,
      morae: [
        { mora: 'タ', high: false },
        { mora: 'ベ', high: true },
        { mora: 'ル', high: false }
      ]
    })
  })

  test('gives a verb its conjugations, with the note that tells same-spelled forms apart', async () => {
    const { conjugations } = (await ask(host, 'wordPage', JSON.stringify(eat))) as EmbeddedWordPage
    expect(conjugations).toMatchObject({
      rule: 'Drop る, then add the ending.',
      modes: ['Plain', 'Polite']
    })
    const plain = conjugations?.rows.Plain ?? []
    expect(plain.map(row => row.surface).slice(0, 3)).toEqual(['食べる', '食べた', '食べない'])
    expect(plain[0]).toMatchObject({
      kind: 'present-future',
      title: 'Present/Future',
      ending: 'る',
      ruby: [{ text: '食', reading: 'た' }, { text: 'べる' }],
      rowFurigana: false,
      note: null
    })
    expect(plain.find(row => row.kind === 'potential')?.note).toBe(
      'Same spelling as Passive. Context tells them apart.'
    )
    expect(conjugations?.rows.Polite[0].surface).toBe('食べます')
  })

  test('gives a word that does not conjugate no table, and one without pitch no contour', async () => {
    const noun: EmbeddedEntry = {
      ...eat,
      headword: '学校',
      reading: 'がっこう',
      partsOfSpeech: ['noun'],
      senses: [{ meaning: 'school', notes: [], partsOfSpeech: ['noun'] }],
      pitch: null
    }
    const page = (await ask(host, 'wordPage', JSON.stringify(noun))) as EmbeddedWordPage
    expect(page.conjugations).toBeNull()
    expect(page.pitch).toBeNull()
    expect(page.ruby).toEqual([
      { text: '学校', reading: 'がっこう', kanjiReadings: ['がっ', 'こう'] }
    ])
    expect(page.kanji).toEqual(['学', '校'])
  })

  const words = [
    { id: 'w1', headword: '学校', reading: 'がっこう', summary: 'school' },
    { id: 'w2', headword: '校長', reading: 'こうちょう', summary: 'principal' },
    { id: 'w3', headword: '高校', reading: 'こうこう', summary: 'high school' },
    { id: 'w4', headword: '校舎', reading: 'こうしゃ', summary: 'school building' },
    { id: 'w5', headword: '校正', reading: 'こうせい', summary: 'proofreading' }
  ]

  test('builds a kanji page from its reference, its elements, and the words the host found', async () => {
    const page = (await ask(
      host,
      'kanjiPage',
      JSON.stringify({ character: '校', words, leadingWord: 'w3' })
    )) as EmbeddedKanjiPage
    expect(page.hasReference).toBe(true)
    expect(page.stats).toEqual([
      { kind: 'strokes', label: 'Stroke', value: '1', spoken: '1 Stroke' }
    ])
    expect(page.meanings).toEqual(['校 meaning', 'second', 'third'])
    expect(page.readings.map(reading => [reading.label, reading.value])).toEqual([
      ['On', 'コウ'],
      ['On', 'キョウ'],
      ['Name', 'たかし']
    ])
    expect(page.readings[0].words.map(word => word.id)).toEqual(['w2', 'w3', 'w4'])
    expect(page.readings[1].words).toEqual([])
    expect(page.components).toEqual([])
    expect(page.elements).toEqual([
      {
        character: '木',
        role: 'meaningStructure',
        roleLabel: 'Meaning / structure',
        meanings: ['tree', 'wood', 'timber'],
        linkedOnReadings: [],
        description: 'tree, wood, timber',
        spoken: 'Element 木, meaning / structure, tree, wood, timber'
      },
      {
        character: '交',
        role: 'sound',
        roleLabel: 'Sound',
        meanings: [],
        linkedOnReadings: ['コウ'],
        description: 'Linked on-readings: コウ',
        spoken: 'Element 交, sound, '
      },
      {
        character: '父',
        role: 'soundPattern',
        roleLabel: 'Sound pattern',
        meanings: [],
        linkedOnReadings: ['コウ', 'フ'],
        description: 'Linked on-readings: コウ, フ',
        spoken: 'Element 父, sound pattern, '
      }
    ])
    expect(page.words.map(word => word.id)).toEqual(['w3', 'w1', 'w2', 'w4', 'w5'])
    expect(page.words[0]).toMatchObject({
      headword: '高校',
      ruby: [{ text: '高校', reading: 'こうこう' }]
    })
    expect(page.shareText).toBe('校【コウ、キョウ、たかし】\n校 meaning, second, third')
  })

  test('lists a kanji’s components when it has no elements, with every stat it has', async () => {
    const page = (await ask(
      host,
      'kanjiPage',
      JSON.stringify({ character: '学', words: [], leadingWord: null })
    )) as EmbeddedKanjiPage
    expect(page.stats).toEqual([
      { kind: 'strokes', label: 'Strokes', value: '8', spoken: '8 Strokes' },
      { kind: 'grade', label: 'Grade', value: '1', spoken: 'Grade 1' },
      { kind: 'jlpt', label: 'JLPT', value: 'N5', spoken: 'JLPT N5' }
    ])
    expect(page.components).toEqual(['子', '冖'])
    expect(page.elements).toEqual([])
  })

  test('still lists the words of a kanji it has no reference for', async () => {
    const page = (await ask(
      host,
      'kanjiPage',
      JSON.stringify({ character: '㐂', words: words.slice(0, 1), leadingWord: null })
    )) as EmbeddedKanjiPage
    expect(page).toMatchObject({
      character: '㐂',
      hasReference: false,
      stats: [],
      meanings: [],
      readings: [],
      shareText: '㐂'
    })
    expect(page.words.map(word => word.id)).toEqual(['w1'])
  })

  test('gives a kanji’s meanings, none for one it has no reference for', async () => {
    expect(await ask(host, 'kanjiMeanings', '学')).toEqual(['学 meaning', 'second', 'third'])
    expect(await ask(host, 'kanjiMeanings', '㐂')).toEqual([])
  })

  test('builds an element page from the element, the kanji in its family, and those containing it', async () => {
    expect(await ask(host, 'kanjiElementPage', '交')).toEqual({
      glyph: '交',
      meanings: [],
      explanation: null,
      soundPatterns: 'Linked on-readings: コウ',
      alternatives: ['校'],
      standalone: { character: '校', meanings: [], onReadings: ['コウ'], spoken: '校, コウ' },
      containing: [],
      structureSource: 'kanjium 8a0c',
      metadataSource: 'edrdg.kanjidic2 2026-10-05'
    })
    expect(await ask(host, 'kanjiElementPage', '木')).toMatchObject({
      explanation: 'This element contributes forms associated with tree, wood, timber, plank.',
      soundPatterns: null,
      standalone: null,
      containing: [{ character: '校' }]
    })
  })

  test('has no element page for a kanji that is no element, or for what is no kanji', async () => {
    expect(await ask(host, 'kanjiElementPage', '学')).toBeNull()
    expect(await ask(host, 'kanjiElementPage', 'あ')).toBeNull()
    expect(await ask(host, 'kanjiElementPage', '交父')).toBeNull()
  })

  test('shortens a meaning to the gloss shown under a linked word', async () => {
    expect(await ask(host, 'gloss', 'to fold (clothes, etc.), to shut')).toBe('fold')
    expect(await ask(host, 'gloss', '(note only)')).toBeNull()
  })

  const youTube = {
    id: 'zenbu.tubelex.youtube.ja.unidic-3.1',
    kind: 'rank',
    name: 'YouTube',
    domain: 'Everyday YouTube Japanese',
    description: 'Fixture',
    version: '2025.1',
    source: 'TUBELEX',
    coveredSourceRows: 100_000
  }
  const frequency = {
    dictionaries: [youTube],
    entries: { e1: [{ dictionary: 0, value: 1_234 }], e2: [{ dictionary: 0, value: null }] }
  }

  test('shows a word page’s frequency rows from the evidence the host supplies', async () => {
    expect(await ask(host, 'frequencyRows', JSON.stringify({ entry: 'e1', frequency }))).toEqual([
      {
        pack: youTube.id,
        source: 'YouTube',
        value: '1,234',
        tier: 'veryCommon',
        spokenTier: 'very common',
        label: 'YouTube frequency rank 1234, very common',
        details: {
          pack: {
            name: 'YouTube',
            domain: 'Everyday YouTube Japanese',
            description: 'Fixture',
            version: '2025.1',
            source: 'TUBELEX'
          },
          section: 'Frequency',
          rows: [
            { label: 'Rank', value: '#1,234' },
            { label: 'Percentile', value: 'Top 1.23%' }
          ],
          explanation: null
        }
      }
    ])
    expect(await ask(host, 'frequencyRows', JSON.stringify({ entry: 'e9', frequency }))).toEqual([])
  })

  test('lists a word sheet’s candidates as result rows', async () => {
    expect(
      await ask(
        host,
        'wordRows',
        JSON.stringify({
          entries: [
            { id: 'e1', summary: 'to eat' },
            { id: 'e2', summary: 'to drink' }
          ],
          frequency,
          known: ['e2']
        })
      )
    ).toMatchObject([
      {
        id: 'e1',
        summary: 'to eat',
        spoken: 'Result 1 of 2, YouTube frequency rank 1234, very common'
      },
      {
        id: 'e2',
        summary: 'to drink',
        spoken: 'Known, Result 2 of 2, YouTube has no rank for this entry'
      }
    ])
  })

  test('builds the results screen from a search’s answer and the learner’s state', async () => {
    const results = {
      items: [
        {
          id: 'e2',
          entSeq: 2,
          headword: '飲む',
          reading: 'のむ',
          entrySummary: 'to drink',
          matchedSummary: null,
          relevance: 0,
          fallbackOrder: 0,
          match: 'source=0 japanese writtenExact'
        },
        {
          id: 'e1',
          entSeq: 1,
          headword: '食べる',
          reading: 'たべる',
          entrySummary: 'to eat',
          matchedSummary: null,
          relevance: 0,
          fallbackOrder: 1,
          match: 'source=0 japanese writtenExact'
        }
      ],
      presentation: 'ranked',
      readingRefinement: null,
      usesPrimaryEntryExamples: false,
      leadingLexicalEntryCount: 2,
      resolution: 'direct',
      primaryEntry: 'e2'
    }
    expect(
      await ask(
        host,
        'resultsScreen',
        JSON.stringify({
          query: 'のむ',
          results,
          exampleCount: 3,
          learner: { frequency, sort: 'default', filter: 'all', known: [], leadingOnly: false }
        })
      )
    ).toMatchObject({
      state: 'results',
      query: 'のむ',
      examples: { title: 'View 3 Example Sentences', highlightedEntry: 'e2' },
      rows: [{ id: 'e1' }, { id: 'e2' }],
      menu: { status: 'Sorted by Default' }
    })
  })
})
