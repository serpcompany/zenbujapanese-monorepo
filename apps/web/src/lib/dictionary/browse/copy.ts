import type { CategoryOrder } from '@zenbu/dictionary-core/artifact/browse'
import { type BrowseCategory, commonWords } from '@zenbu/dictionary-core/browse/categories'
import type { KanjiList } from '@zenbu/dictionary-core/browse/lists'
import { type Source, sources } from '../sources'

const count = new Intl.NumberFormat('en-US')

export const formatCount = (value: number) => count.format(value)

const compact = new Intl.NumberFormat('en-US', { notation: 'compact' })

export const compactCount = (value: number) => compact.format(value)

export const plural = (value: number, one: string, many = `${one}s`) =>
  `${formatCount(value)} ${value === 1 ? one : many}`

const usagePhrases: Record<string, { heading: string; marks: string }> = {
  onomatopoeia: {
    heading: 'Japanese onomatopoeia and mimetic words',
    marks: 'onomatopoeic or mimetic'
  },
  yojijukugo: { heading: 'Yojijukugo: Japanese four-character idioms', marks: 'yojijukugo' },
  proverbs: { heading: 'Japanese proverbs', marks: 'proverbs' },
  idioms: { heading: 'Japanese idioms', marks: 'idiomatic expressions' },
  'honorific-language': {
    heading: 'Japanese honorific language (sonkeigo)',
    marks: 'honorific (sonkeigo)'
  },
  'humble-language': { heading: 'Japanese humble language (kenjōgo)', marks: 'humble (kenjōgo)' },
  'polite-language': { heading: 'Japanese polite language (teineigo)', marks: 'polite (teineigo)' },
  'kana-words': {
    heading: 'Japanese words usually written in kana',
    marks: 'usually written in kana alone'
  }
}

const lowerFirst = (name: string) => name.charAt(0).toLowerCase() + name.slice(1)

export function categoryHeading(category: BrowseCategory): string {
  const usage = usagePhrases[category.slug]
  if (usage) return usage.heading
  switch (category.kind) {
    case 'dialect':
      return `${category.name} words`
    case 'subject':
      return `Japanese ${lowerFirst(category.name.replace(/^The /u, ''))} vocabulary`
    case 'common':
      return 'Common Japanese words'
    default:
      return `Japanese ${lowerFirst(category.name)}`
  }
}

function marking(category: BrowseCategory): string {
  switch (category.kind) {
    case 'partOfSpeech':
      return `lists as ${lowerFirst(category.name)}`
    case 'subject':
      return `marks as ${lowerFirst(category.name)} terms`
    case 'dialect':
      return `marks as ${category.name}`
    case 'common':
      return 'marks as common, from its priority lists'
    default:
      return `marks as ${usagePhrases[category.slug]?.marks ?? lowerFirst(category.name)}`
  }
}

export const orderNames: Record<CategoryOrder, string> = {
  used: 'Most used',
  kana: 'Kana order'
}

const orderPhrases: Record<CategoryOrder, string> = {
  used: 'most used on YouTube first',
  kana: 'in kana order'
}

export function categoryIntro(category: BrowseCategory, total: number, order: CategoryOrder) {
  return `${plural(total, 'word')} JMdict ${marking(category)}, ${orderPhrases[order]}.`
}

interface RankedListCopy {
  description: string
  sources: Source[]
}

const jiten = (media: string): RankedListCopy => ({
  description: `Words ranked by how often they appear in ${media}, from Jiten's frequency lists.`,
  sources: [sources.jmdict, sources.jiten]
})

export const rankedListCopy: Record<string, RankedListCopy> = {
  youtube: {
    description: 'Words ranked by how often they’re said in YouTube videos, from TUBELEX.',
    sources: [sources.jmdict, sources.tubelex]
  },
  wikipedia: {
    description: 'Words ranked by how often they’re written in Japanese Wikipedia.',
    sources: [sources.jmdict, sources.wikipedia]
  },
  'tv-and-movies': jiten('Japanese TV dramas and films'),
  anime: jiten('anime'),
  manga: jiten('manga'),
  novels: jiten('novels and light novels'),
  'visual-novels': jiten('visual novels'),
  'video-games': jiten('video game scripts')
}

const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth']

const opensItsSearch =
  'Each opens its search page, with its readings, stroke order, and every word that uses it.'

export const jlptKanjiEstimate =
  'The JLPT has published no kanji list since 2010, so these levels are estimates.'

function whichKanji(list: KanjiList): string {
  const grades = list.grades ?? []
  const [grade] = grades
  if (list.strokes !== undefined) return `jōyō kanji written with ${plural(list.strokes, 'stroke')}`
  if (list.jlptLevel !== undefined) return `kanji Jonathan Waller lists for JLPT N${list.jlptLevel}`
  if (grades.length === 1 && grade <= ordinals.length) {
    return `kanji Japanese schools teach in the ${ordinals[grade - 1]} year of primary school`
  }
  return grade === 8
    ? 'jōyō kanji Japanese schools teach in secondary school'
    : 'jinmeiyō kanji, approved for use in names'
}

export function kanjiListIntro(list: KanjiList, total: number): string {
  const estimate = list.jlptLevel === undefined ? '' : ` ${jlptKanjiEstimate}`
  return `The ${formatCount(total)} ${whichKanji(list)}, most frequent first.${estimate} ${opensItsSearch}`
}

export const featuredCategories = {
  partOfSpeech: [
    'nouns',
    'suru-verbs',
    'godan-verbs',
    'ichidan-verbs',
    'i-adjectives',
    'na-adjectives',
    'adverbs'
  ],
  usage: [
    'onomatopoeia',
    'yojijukugo',
    'proverbs',
    'honorific-language',
    'humble-language',
    'slang',
    'kansai-dialect'
  ],
  subject: ['medicine', 'computing', 'food-and-cooking', 'law', 'business', 'sports', 'buddhism']
} as const

export const moreWaysToBrowse: readonly string[] = [
  ...featuredCategories.usage,
  'archaic-words',
  'godan-verbs',
  'medicine',
  commonWords.slug
]

export const jlptCopy: RankedListCopy = {
  description:
    "Words from Jonathan Waller's unofficial JLPT vocabulary lists. JLPT has published no official list since 2010, so levels are study estimates.",
  sources: [sources.jmdict, sources.jlpt]
}
