import { defaultFrequencyPacks, frequencyChips } from '@zenbu/dictionary-core/detail/frequency'
import { type RubySegment, rubySegments } from '@zenbu/dictionary-core/detail/ruby'
import { searchPath } from '@/lib/dictionary/urls'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'
import { productionOrigin } from '@/lib/origins'

export const appScreenText = {
  player: 'Player',
  meaning: 'Meaning',
  wordsKnown: '{known} of {total} words known',
  words: '{count} words',
  known: 'Known',
  learning: 'Learning',
  enabled: 'Enabled',
  available: 'Available: {names}'
}

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
  time: { elapsed: '0:42', total: '3:15' },
  known: { words: 38, of: 52 },
  previous: { text: 'おはようございます。', english: 'Good morning!', time: '0:37–0:40' },
  caption: {
    time: '0:40–0:44',
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
    { ...word('美味しい', 'おいしい'), state: 'known' },
    { ...word('峠', 'とうげ'), state: 'learning' },
    { ...word('急がば回れ', 'いそがばまわれ'), state: null },
    { ...word('醤油', 'しょうゆ'), state: null },
    { ...word('大丈夫', 'だいじょうぶ'), state: 'known' },
    { ...word('頑張る', 'がんばる'), state: null }
  ]
}

export const frequencyPreview = {
  enabled: defaultFrequencyPacks.map(pack => pack.name),
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

export const searchAddressIn = (locale: Locale) =>
  `${new URL(productionOrigin).host}${localizedPath(searchPath(taberuQuery), locale)}`

export const searchPreview = {
  query: taberuQuery,
  links: ['View 50+ Example Sentences', 'Search for「たべる」'],
  meaningTitle: 'Meaning',
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
