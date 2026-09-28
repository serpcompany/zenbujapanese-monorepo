import type {
  EntryRecord,
  ExampleRecord,
  FrequencyRecord,
  KanjiRecord
} from '@/lib/dictionary/records'
import entries from './entries.json'

/**
 * Local fixture data: real entries exported by scripts/export-dictionary-fixtures.py, plus the
 * frequency, examples, and kanji details the app showed for them. Never used in production.
 */
export const fixtureEntries: EntryRecord[] = entries

export const fixtureFrequency: Record<number, FrequencyRecord[]> = {
  1546640: [
    { source: 'JLPT', value: 'N5', band: 'veryCommon' },
    { source: 'YouTube', value: '949', band: 'veryCommon' },
    { source: 'Anime', value: '2,373', band: 'common' }
  ],
  1577980: [
    { source: 'JLPT', value: 'N5', band: 'veryCommon' },
    { source: 'Anime', value: '5,409', band: 'uncommon' }
  ],
  1391500: [
    { source: 'JLPT', value: 'N2', band: 'common' },
    { source: 'YouTube', value: '14,572', band: 'uncommon' },
    { source: 'Anime', value: '94,921', band: 'rare' }
  ],
  1465580: [
    { source: 'JLPT', value: 'N1', band: 'uncommon' },
    { source: 'Anime', value: '54,621', band: 'rare' }
  ]
}

const iru = (text = '要る'): { text: string; reading: string; isWord: true; isMatch: true } => ({
  text,
  reading: 'い',
  isWord: true,
  isMatch: true
})

export const fixtureExamples: Record<number, ExampleRecord[]> = {
  1546640: [
    { tokens: [iru(), { text: '？' }], translation: 'Want it?' },
    {
      tokens: [
        { text: '車', reading: 'くるま', isWord: true },
        { text: 'が', isWord: true },
        iru(),
        { text: 'の', isWord: true },
        { text: '？' }
      ],
      translation: 'Do you want a car?'
    },
    {
      tokens: [
        { text: '両方', reading: 'りょうほう', isWord: true },
        iru(),
        { text: 'よ', isWord: true },
        { text: '。' }
      ],
      translation: 'We need both.'
    },
    {
      tokens: [
        { text: '金', isWord: true },
        { text: 'が', isWord: true },
        iru(),
        { text: 'んだ', isWord: true },
        { text: '。' }
      ],
      translation: 'I need money.'
    },
    {
      tokens: [
        { text: 'これ', isWord: true },
        iru(),
        { text: 'んだっけ', isWord: true },
        { text: '？' }
      ],
      translation: 'Do I need this?'
    },
    {
      tokens: [
        { text: '夫', reading: 'おっと', isWord: true },
        { text: 'が', isWord: true },
        iru(),
        { text: '。' },
        { text: '今', reading: 'いま', isWord: true },
        { text: 'すぐ', isWord: true },
        { text: '。' }
      ],
      translation: 'I want my husband. Now.'
    }
  ]
}

export const fixtureKanji: KanjiRecord[] = [
  {
    character: '要',
    strokeCount: 9,
    grade: 4,
    jlpt: 2,
    meanings: ['need', 'main point', 'essence', 'pivot', 'key to'],
    readings: [
      {
        kind: 'on',
        value: 'ヨウ',
        words: [
          { headword: '要', summary: 'main point, essential point, important thing' },
          { headword: '要項', summary: 'important points, main points, gist' },
          { headword: '要求', summary: 'demand, firm request, requisition' }
        ]
      },
      {
        kind: 'kun',
        value: 'い.る',
        words: [{ headword: '要る', summary: 'to be needed, to be necessary, to be required' }]
      },
      { kind: 'kun', value: 'かなめ', words: [{ headword: '要', summary: 'pivot' }] },
      { kind: 'name', value: 'とし', words: [] }
    ],
    elements: [
      { character: '女', role: 'Sound pattern', meaning: 'woman, female' },
      { character: '覀', role: 'Meaning / structure', meaning: 'variant of radical 146' }
    ],
    words: [1546640, 1609600, 2188720, 1546750, 1546680, 1546850, 1612150]
  }
]

/** The order the app lists these words for a search, with its default frequency dictionaries. */
export const fixtureSearchOrder: Record<string, number[]> = {
  いる: [1546640, 1577980, 1391500, 1465580, 1322180, 1587780],
  iru: [1546640, 1577980, 1391500, 1465580, 1322180, 1587780],
  要: [1609600, 2188720, 1546640, 1546750, 1546680, 1546850, 1612150]
}
