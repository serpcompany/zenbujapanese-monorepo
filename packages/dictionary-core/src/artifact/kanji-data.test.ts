import { describe, expect, test } from 'vitest'
import { kanjiDetail } from '../detail/kanji'
import { KanjiData, type KanjiReferenceEntry } from './kanji-data'

const reference = (
  character: string,
  grade: number,
  levels: { kanjidic2: number | null; waller: number | null }
): KanjiReferenceEntry & { jlpt: number | null } => ({
  character,
  strokeCount: 4,
  grade,
  jlpt: levels.kanjidic2,
  wallerJlptLevel: levels.waller,
  frequencyRank: null,
  meanings: [],
  readings: [],
  components: []
})

const kanji = new KanjiData(
  {
    metadataSourceIdentity: 'edrdg.kanjidic2',
    componentSourceIdentity: 'edrdg.kradfile',
    entries: [
      reference('一', 1, { kanjidic2: 4, waller: 5 }),
      reference('日', 1, { kanjidic2: 4, waller: 5 }),
      reference('分', 2, { kanjidic2: 4, waller: null })
    ]
  },
  { schema: 'zenbu.kanji-elements.v1', kanji: [], elements: [] }
)

const jlptShown = (character: string) => {
  const row = kanji.row(character)
  if (!row) throw new Error(`no row for ${character}`)
  const detail = kanjiDetail({
    kanji: row,
    structure: null,
    elements: [],
    words: [],
    strokes: null
  })
  return detail.stats.find(stat => stat.label === 'JLPT')?.value ?? null
}

describe('a kanji’s JLPT level', () => {
  test('is the level Waller’s kanji lists give it, not KANJIDIC2’s pre-2010 level', () => {
    expect(jlptShown('一')).toBe('N5')
    expect(jlptShown('日')).toBe('N5')
  })

  test('is absent for a kanji his lists leave out, though KANJIDIC2 has one', () => {
    expect(jlptShown('分')).toBeNull()
  })
})

describe('an element page’s rows', () => {
  const structure = (character: string, frequencyRank: number | null) => ({
    character,
    meanings: [`${character} meaning`],
    onReadings: ['シャ'],
    frequencyRank,
    elementGlyphs: [],
    explicitPhoneticElement: null
  })
  const elements = new KanjiData(
    {
      metadataSourceIdentity: 'edrdg.kanjidic2',
      componentSourceIdentity: 'edrdg.kradfile',
      entries: []
    },
    {
      schema: 'zenbu.kanji-elements.v1',
      kanji: [structure('者', 300), structure('都', 1)],
      elements: [
        {
          glyph: '者',
          alternatives: ['耂'],
          meanings: ['someone'],
          onReadings: ['シャ'],
          commonLinkedOnReadings: ['ショ'],
          containingCharacters: ['都', '諸']
        }
      ]
    }
  )
  const sources = {
    snapshot: '8a0c',
    structureSourceIdentity: 'kanjium',
    metadataSourceIdentity: 'edrdg.kanjidic2',
    metadataSourceSnapshot: '2026-10-05'
  }

  test('hold the element, the kanji among it and its alternatives, and the kanji containing it', () => {
    expect(elements.elementPageRows('者', sources)).toEqual({
      glyph: '者',
      meanings: ['someone'],
      commonLinkedOnReadings: ['ショ'],
      alternatives: ['耂'],
      family: [
        { character: '者', meanings: ['者 meaning'], onReadings: ['シャ'], frequencyRank: 300 }
      ],
      containing: [
        { character: '都', meanings: ['都 meaning'], onReadings: ['シャ'], frequencyRank: 1 }
      ],
      structureSource: 'kanjium 8a0c',
      metadataSource: 'edrdg.kanjidic2 2026-10-05'
    })
  })

  test('are absent for a glyph the file does not list as an element', () => {
    expect(elements.elementPageRows('都', sources)).toBeNull()
  })
})
