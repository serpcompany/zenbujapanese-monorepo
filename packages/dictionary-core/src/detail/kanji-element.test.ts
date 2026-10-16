import { describe, expect, test } from 'vitest'
import { kanjiElementDetail } from './kanji-element'
import type { KanjiElementKanjiRow, KanjiElementPageRows } from './rows'

const kanji = (
  character: string,
  frequencyRank: number | null,
  meanings: string[] = [`${character} meaning`]
): KanjiElementKanjiRow => ({ character, meanings, onReadings: ['シャ'], frequencyRank })

const rows = (overrides: Partial<KanjiElementPageRows> = {}): KanjiElementPageRows => ({
  glyph: '者',
  meanings: ['someone', 'person'],
  commonLinkedOnReadings: ['ショ', 'シャ'],
  alternatives: [],
  family: [],
  containing: [],
  structureSource: 'kanjium 8a0c',
  metadataSource: 'edrdg.kanjidic2 2026-10-05',
  ...overrides
})

const twin = String.fromCodePoint(0xfa5b)

describe('kanjiElementDetail', () => {
  test('says what an element contributes and which on-readings it links', () => {
    expect(kanjiElementDetail(rows())).toEqual({
      sections: [
        { kind: 'explanation', title: 'Meaning / structure' },
        { kind: 'soundPatterns', title: 'Sound patterns' },
        { kind: 'source', title: 'Source' }
      ],
      glyph: '者',
      meanings: ['someone', 'person'],
      explanation: 'This element contributes forms associated with someone, person.',
      soundPatterns: 'Linked on-readings: ショ, シャ',
      alternatives: [],
      standalone: null,
      containing: [],
      structureSource: 'kanjium 8a0c',
      metadataSource: 'edrdg.kanjidic2 2026-10-05'
    })
    expect(kanjiElementDetail(rows({ meanings: [], commonLinkedOnReadings: [] }))).toMatchObject({
      explanation: null,
      soundPatterns: null
    })
  })

  test('shows a kanji with its first three meanings, and says all of them', () => {
    const detail = kanjiElementDetail(
      rows({ containing: [kanji('都', 1, ['metropolis', 'capital', 'all', 'everything'])] })
    )
    expect(detail.containing).toEqual([
      {
        character: '都',
        meanings: ['metropolis', 'capital', 'all'],
        onReadings: ['シャ'],
        spoken: '都, metropolis, capital, all, everything, シャ'
      }
    ])
  })

  test('stands the most frequent of the element and its alternatives alone', () => {
    const family = [kanji('丑', 2_000), kanji('丒', null), kanji('醜', 1_500)]
    expect(kanjiElementDetail(rows({ family })).standalone?.character).toBe('醜')
    expect(kanjiElementDetail(rows({ family: family.slice(0, 2) })).standalone?.character).toBe(
      '丑'
    )
    expect(
      kanjiElementDetail(rows({ family: [kanji('醜', null), kanji('丒', null)] })).standalone
        ?.character
    ).toBe('丒')
    expect(
      kanjiElementDetail(rows({ family: [kanji('醜', 7), kanji('丒', 7)] })).standalone?.character
    ).toBe('丒')
  })

  test('leaves the kanji that stands alone out of those containing the element', () => {
    const detail = kanjiElementDetail(
      rows({ family: [kanji('者', 300)], containing: [kanji('都', 1), kanji('者', 300)] })
    )
    expect(detail.containing.map(found => found.character)).toEqual(['都'])
  })

  test('treats a compatibility twin as the same kanji', () => {
    const unranked = kanjiElementDetail(rows({ family: [kanji(twin, null), kanji('者', null)] }))
    expect(unranked.standalone?.character).toBe(twin)
    const detail = kanjiElementDetail(
      rows({ family: [kanji('者', 300)], containing: [kanji('都', 1), kanji(twin, null)] })
    )
    expect(detail.containing.map(found => found.character)).toEqual(['都'])
  })

  test('lists only kanji: a glyph that is no kanji is no alternative and no containing kanji', () => {
    const detail = kanjiElementDetail(
      rows({
        alternatives: ['靑', 'x', '氵'],
        family: [kanji('x', 1)],
        containing: [kanji('ア', 1), kanji('都', 2)]
      })
    )
    expect(detail.alternatives).toEqual(['靑', '氵'])
    expect(detail.standalone).toBeNull()
    expect(detail.containing.map(found => found.character)).toEqual(['都'])
  })
})
