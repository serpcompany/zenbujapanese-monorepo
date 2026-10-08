import { defaultFrequencyPacks, frequencyChips } from '@zenbu/dictionary-core/detail/frequency'
import { type RubySegment, rubySegments } from '@zenbu/dictionary-core/detail/ruby'
import { searchPath } from '@/lib/dictionary/urls'
import { productionOrigin } from '@/lib/site'

const word = (headword: string, reading: string) => ({
  headword,
  ruby: rubySegments(headword, reading)
})

const taberu = word('食べる', 'たべる')

const taberuQuery = 'taberu'

const taberuChips = frequencyChips([
  { pack: 'jlpt', level: 5 },
  { pack: 'tubelex', rank: 165 }
])

const taberuResult = { ...taberu, meaning: 'to eat', chips: taberuChips }

export const playerPreview = {
  caption: {
    words: ['今日', 'は', '天気', 'が', 'いいです', 'ね'],
    end: '。',
    english: 'The weather is nice today.'
  },
  open: {
    ...word('天気', 'てんき'),
    partOfSpeech: 'Noun',
    meanings: ['weather', 'fair weather, fine weather']
  }
}

export const listPreview = {
  name: 'Favorites',
  words: [
    { ...word('美味しい', 'おいしい'), known: true },
    { ...word('峠', 'とうげ'), known: false },
    { ...word('急がば回れ', 'いそがばまわれ'), known: false },
    { ...word('醤油', 'しょうゆ'), known: false },
    { ...word('大丈夫', 'だいじょうぶ'), known: true },
    { ...word('頑張る', 'がんばる'), known: false }
  ]
}

export const frequencyPreview = {
  enabled: defaultFrequencyPacks.map(pack => pack.disclosure.name),
  available: [
    'Japanese Wikipedia',
    'TV & Movies',
    'Anime',
    'Manga',
    'Novels',
    'Visual Novels',
    'Video Games'
  ],
  word: taberuResult
}

export const furiganaPreview: {
  segments: RubySegment[]
  highlighted: { segment: number; kanji: number }
} = {
  segments: [
    {
      text: '弱肉強食',
      reading: 'じゃくにくきょうしょく',
      kanjiReadings: ['じゃく', 'にく', 'きょう', 'しょく']
    }
  ],
  highlighted: { segment: 0, kanji: 1 }
}

export const searchPreview = {
  address: `${new URL(productionOrigin).host}${searchPath(taberuQuery)}`,
  query: taberuQuery,
  links: ['View 50+ Example Sentences', 'Search for「たべる」'],
  results: [
    taberuResult,
    {
      ...word('食べるラー油', 'たべるラーゆ'),
      meaning: 'chili oil mixed with chopped garlic, onions, etc.',
      chips: []
    }
  ],
  open: {
    ...taberu,
    partOfSpeech: 'Ichidan verb (transitive)',
    meanings: ['to eat', 'to live on (e.g. a salary), to live off, to subsist on']
  }
}

export const offlinePreview = {
  ...word('峠', 'とうげ'),
  meaning: '(mountain) pass, highest point on a mountain road, ridge'
}

export const storedOnDevice = ['Lists', 'Notes', 'Known Words', 'Translations']
