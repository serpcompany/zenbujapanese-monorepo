import { describe, expect, test } from 'vitest'
import type { ArtifactDatabase } from './database'
import { readKanji } from './kanji'
import { KanjiData } from './kanji-data'

const kanji = new KanjiData(
  {
    metadataSourceIdentity: 'edrdg.kanjidic2',
    componentSourceIdentity: 'edrdg.kradfile',
    entries: [
      {
        character: '要',
        strokeCount: 9,
        grade: 4,
        wallerJlptLevel: 3,
        frequencyRank: 152,
        meanings: ['need'],
        readings: [],
        components: []
      }
    ]
  },
  { schema: 'zenbu.kanji-elements.v1', kanji: [], elements: [] }
)

const asked: string[] = []
const withoutStrokeData: ArtifactDatabase = {
  all<Row>(sql: string): Row[] {
    asked.push(sql)
    if (sql.includes('strokes.')) throw new Error('no such table: strokes.stroke_diagrams')
    return []
  }
}

describe('reading a kanji', () => {
  test('without the stroke data, answers its rows with no strokes and never reads them', () => {
    const rows = readKanji(withoutStrokeData, kanji, '要', false)
    expect(rows?.kanji.character).toBe('要')
    expect(rows?.strokes).toBeNull()
    expect(asked.some(sql => sql.includes('strokes.'))).toBe(false)
  })

  test('with the stroke data, reads the strokes', () => {
    expect(() => readKanji(withoutStrokeData, kanji, '要')).toThrow(/strokes\.stroke_diagrams/)
  })
})
