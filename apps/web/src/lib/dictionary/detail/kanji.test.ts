import { describe, expect, test } from 'vitest'
import { fixtureKanjiRows } from '@/lib/dictionary/fixtures'
import { kanjiDetail, kanjiElements, kanjiWords, wordsForReading } from './kanji'
import type { KanjiRows, KanjiWordRow } from './rows'

// Expected values follow KanjiDetailView.swift, LookupClient.swift's entries(containingKanji:),
// and KanjiElementLookupClient.swift, over the app's bundled data for 要 (the fixtures).

const kaname = fixtureKanjiRows.find(rows => rows.kanji.character === '要') as KanjiRows

/**
 * The app's 24 words for 要, from kanjiCandidateRowsSQL (LIMIT 24) run on the bundled
 * LanguageReferenceData.sqlite3, each group shown as its entry with the smallest ID.
 */
const appWords = [
  1609600, 2188720, 1546640, 1546750, 1546680, 1546850, 1612150, 1546670, 1546830, 1546800, 1546820,
  1546770, 1605860, 1546780, 1546730, 1836130, 1546740, 1662320, 1836270, 1914670, 1546660, 1546760,
  1662260, 1836230
]

function word(overrides: Partial<KanjiWordRow> & Pick<KanjiWordRow, 'id'>): KanjiWordRow {
  return {
    entSeq: Number.parseInt(overrides.id, 16),
    headword: '要',
    reading: 'よう',
    summary: '',
    fingerprint: overrides.id,
    isCommon: false,
    rankScore: 0,
    containsKanji: true,
    ...overrides
  }
}

describe('kanjiWords (entries(containingKanji:))', () => {
  test('lists the app’s 24 words for 要, in its order', () => {
    expect(kanjiWords('要', kaname.words).map(row => row.entSeq)).toEqual(appWords)
  })

  test('orders by leading kanji, headword length, commonness, rank score, then fingerprint', () => {
    const rows = [
      word({ id: '01', headword: '不要', isCommon: true, rankScore: 100 }),
      word({ id: '02', headword: '要点' }),
      word({ id: '03', headword: '要', rankScore: 10 }),
      word({ id: '04', headword: '要', isCommon: true }),
      word({ id: '06', headword: '要', rankScore: 10 }),
      word({ id: '05', headword: '要', rankScore: 10 })
    ]
    expect(kanjiWords('要', rows).map(row => row.id)).toEqual(['04', '03', '05', '06', '02', '01'])
    expect(kanjiWords('要', rows, 2).map(row => row.id)).toEqual(['04', '03'])
  })

  test('shows a fingerprint group as its smallest ID, ranked by its matching entries only', () => {
    const rows = [
      // The group's matching entry has a long headword; its other entry, not written with 要,
      // doesn't count toward the order but is the one shown.
      word({ id: 'b1', fingerprint: 'g1', headword: '要約する' }),
      word({ id: 'a1', fingerprint: 'g1', headword: 'x', containsKanji: false }),
      word({ id: 'c1', fingerprint: 'g2', headword: '要人' }),
      // A group with no matching entry isn't listed.
      word({ id: '00', fingerprint: 'g3', containsKanji: false })
    ]
    expect(kanjiWords('要', rows).map(row => row.id)).toEqual(['c1', 'a1'])
  })
})

describe('wordsForReading (KanjiReadingsSection)', () => {
  const words = kanjiWords('要', kaname.words)

  test('lists up to three words whose reading starts with the reading’s stem', () => {
    const headwords = (value: string, kind: 'on' | 'kun' | 'name') =>
      wordsForReading({ value, kind }, words).map(entry => `${entry.headword}:${entry.reading}`)
    // An on reading in katakana matches readings in hiragana.
    expect(headwords('ヨウ', 'on')).toEqual(['要:よう', '要項:ようこう', '要求:ようきゅう'])
    // The okurigana dot is dropped: い.る gives いる.
    expect(headwords('い.る', 'kun')).toEqual(['要る:いる'])
    expect(headwords('かなめ', 'kun')).toEqual(['要:かなめ'])
    expect(headwords('とし', 'name')).toEqual([])
    expect(headwords('-', 'on')).toEqual([])
  })
})

describe('kanjiElements (KanjiElementReferenceData.elements)', () => {
  test('要: 女 shares the on reading ヨウ, 覀 doesn’t', () => {
    expect(kanjiElements(kaname.structure, kaname.elements)).toEqual([
      {
        character: '女',
        role: 'soundPattern',
        roleLabel: 'Sound pattern',
        description: 'woman, female'
      },
      {
        character: '覀',
        role: 'meaningStructure',
        roleLabel: 'Meaning / structure',
        description: 'variant of radical 146'
      }
    ])
  })

  test('the explicit phonetic element is Sound; an element without meanings shows readings', () => {
    const structure = {
      onReadings: ['セイ'],
      elementGlyphs: ['青', '氵', 'x'],
      explicitPhoneticElement: '青'
    }
    const elements = [
      {
        glyph: '青',
        meanings: ['blue', 'green', 'young', 'unripe'],
        commonLinkedOnReadings: ['セイ']
      },
      { glyph: '氵', meanings: [], commonLinkedOnReadings: ['コウ'] },
      // Not a kanji, so the app has no element page for it and leaves it out.
      { glyph: 'x', meanings: ['letter'], commonLinkedOnReadings: [] }
    ]
    expect(kanjiElements(structure, elements)).toEqual([
      { character: '青', role: 'sound', roleLabel: 'Sound', description: 'blue, green, young' },
      {
        character: '氵',
        role: 'meaningStructure',
        roleLabel: 'Meaning / structure',
        description: 'Linked on-readings: コウ'
      }
    ])
    expect(kanjiElements(null, elements)).toEqual([])
  })
})

describe('kanjiDetail', () => {
  test('要', () => {
    const detail = kanjiDetail(kaname)
    // KANJIDIC2's JLPT (2, the pre-2010 scale) is left out (#485).
    expect(detail.stats).toEqual([
      { label: 'Strokes', value: 9 },
      { label: 'Grade', value: 4 }
    ])
    expect(detail.meanings).toEqual(['need', 'main point', 'essence', 'pivot', 'key to'])
    expect(
      detail.readings.map(reading => [reading.label, reading.value, reading.words.length])
    ).toEqual([
      ['On', 'ヨウ', 3],
      ['Kun', 'い.る', 1],
      ['Kun', 'かなめ', 1],
      ['Name', 'とし', 0]
    ])
    // Kanjium has elements for 要, so KRADFILE's components aren't listed.
    expect(detail.components).toEqual([])
    expect(detail.words).toHaveLength(24)
    expect(detail.words[2]).toEqual({
      entSeq: 1546640,
      headword: '要る',
      reading: 'いる',
      ruby: [{ text: '要', reading: 'い' }, { text: 'る' }],
      summary: 'to be needed, to be necessary, to be required, to be wanted, to need, to want'
    })
    expect(detail.shareText).toBe(
      '要【ヨウ、い.る、かなめ、とし】\nneed, main point, essence, pivot, key to'
    )
  })

  test('a kanji without elements lists its components; one stroke is singular', () => {
    const detail = kanjiDetail({
      kanji: {
        character: '乁',
        strokeCount: 1,
        grade: null,
        jlpt: null,
        meanings: [],
        readings: [],
        components: ['ノ']
      },
      structure: null,
      elements: [],
      words: []
    })
    expect(detail.stats).toEqual([{ label: 'Stroke', value: 1 }])
    expect(detail.components).toEqual(['ノ'])
    expect(detail.shareText).toBe('乁')
  })
})
