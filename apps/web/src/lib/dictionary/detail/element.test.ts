import { describe, expect, test } from 'vitest'
import { isIndexableElement, kanjiElementDetail } from './element'
import type { ElementKanjiRow, KanjiElementRows } from './rows'

// Expected values follow KanjiElementReferenceData.entry(_:) in KanjiElementLookupClient.swift and
// the presentation KanjiElementDetailView.swift shares. The kanji-element-detail suite checks the
// port against the app for every case; these cover the rules' edges.

const sources = {
  snapshot: '8a0c',
  structureSourceIdentity: 'kanjium',
  metadataSourceIdentity: 'edrdg.kanjidic2',
  metadataSourceSnapshot: '2026-08-10'
}

const kanji = (character: string, frequencyRank: number | null, meanings = ['m']) =>
  ({ character, meanings, onReadings: [], frequencyRank }) satisfies ElementKanjiRow

function rows(overrides: Partial<KanjiElementRows['element']>, list: ElementKanjiRow[]) {
  return {
    element: {
      glyph: '一',
      alternatives: [],
      meanings: [],
      onReadings: [],
      commonLinkedOnReadings: [],
      containingCharacters: [],
      ...overrides
    },
    kanji: list,
    sources
  }
}

describe('kanjiElementDetail (KanjiElementReferenceData.entry)', () => {
  test('the standalone kanji is the ranked one first, then by character', () => {
    const ranked = kanjiElementDetail(
      rows({ glyph: '一', alternatives: ['弌'] }, [kanji('一', null), kanji('弌', 3000)])
    )
    expect(ranked.standaloneKanji?.character).toBe('弌')
    const unranked = kanjiElementDetail(
      rows({ glyph: '丙', alternatives: ['乙'] }, [kanji('丙', null), kanji('乙', null)])
    )
    // Both unranked: the smaller character, 丙 (U+4E19) before 乙 (U+4E59).
    expect(unranked.standaloneKanji?.character).toBe('丙')
  })

  test('the standalone kanji is left out of the kanji containing it, by canonical equivalence', () => {
    const detail = kanjiElementDetail(
      rows({ glyph: '海', alternatives: ['海'], containingCharacters: ['海', '塰'] }, [
        kanji('海', 200),
        kanji('塰', null)
      ])
    )
    expect(detail.standaloneKanji?.character).toBe('海')
    expect(detail.containingKanji.map(row => row.character)).toEqual(['塰'])
  })

  test('shows only the sections with something to show, with the app’s words', () => {
    const detail = kanjiElementDetail(
      rows({ glyph: '㔾', alternatives: ['卩'], commonLinkedOnReadings: ['コウ', 'ハン'] }, [])
    )
    expect(detail.sections).toEqual(['alternativeForms', 'soundPatterns', 'source'])
    expect(detail.meanings).toBeNull()
    expect(detail.meaningExplanation).toBeNull()
    expect(detail.soundPatterns).toBe('Linked on-readings: コウ, ハン')
    expect(detail.structureSource).toBe('kanjium 8a0c')
    expect(detail.metadataSource).toBe('edrdg.kanjidic2 2026-08-10')
  })

  test('a row shows up to three meanings and every on-reading', () => {
    const detail = kanjiElementDetail(
      rows({ meanings: ['one'], containingCharacters: ['大'] }, [
        {
          character: '大',
          meanings: ['large', 'big', 'great', 'huge'],
          onReadings: ['ダイ', 'タイ'],
          frequencyRank: 7
        }
      ])
    )
    expect(detail.meaningExplanation).toBe('This element contributes forms associated with one.')
    expect(detail.containingKanji).toEqual([
      { character: '大', meanings: 'large, big, great', readings: 'ダイ, タイ' }
    ])
  })

  test('an element needs meanings or linked on-readings to be indexed', () => {
    expect(isIndexableElement({ meanings: [], commonLinkedOnReadings: ['キ'] })).toBe(true)
    expect(isIndexableElement({ meanings: [], commonLinkedOnReadings: [] })).toBe(false)
  })
})
