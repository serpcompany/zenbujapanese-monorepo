import type { KanjiElementFile, KanjiReferenceFile } from '../artifact/kanji-data'
import type { EmbeddedHost } from './host'
import type { EmbeddedEntry } from './presentation'

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

export const kanjiFiles = { ...reference, schema: elements.schema, elements: elementSources }

export const host: EmbeddedHost = {
  kanjiSources: () => kanjiFiles,
  kanjiEntry: character => reference.entries.find(entry => entry.character === character) ?? null,
  kanjiStructure: character => elements.kanji.find(entry => entry.character === character) ?? null,
  kanjiElement: glyph => elements.elements.find(entry => entry.glyph === glyph) ?? null
}

export const eat: EmbeddedEntry = {
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
