import {
  type BrowseCategory,
  type CategoryOrder,
  commonWords
} from '@zenbu/dictionary-core/browse/categories'
import { type KanjiList, type RankBand, rankBandSize } from '@zenbu/dictionary-core/browse/lists'
import { type FrequencyTier, tierForRank } from '@zenbu/dictionary-core/detail/frequency'
import { type SourceCredit, sourceCredits } from '@zenbu/dictionary-core/sources/credits'
import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { type Dictionary, getDictionary } from '@/lib/i18n/dictionary'
import { fill, formatNumber, type Plural, pluralOf } from '@/lib/i18n/format'
import { categoryName } from './category-names'
import type { Ranks } from './rank-pages'

type Values = Readonly<Record<string, string | number>>

export const browseText = (locale: Locale) => getDictionary(locale).browse

export function counted(forms: Plural, count: number, locale: Locale, values: Values = {}) {
  return fill(pluralOf(forms, count, locale), { ...values, count: formatNumber(count, locale) })
}

export function joinSentences(
  sentences: readonly (string | null | undefined)[],
  locale: Locale
): string {
  const template = browseText(locale).sentences
  return sentences
    .filter((sentence): sentence is string => Boolean(sentence))
    .reduce((first, second) => fill(template, { first, second }))
}

export const pagedTitle = (title: string, page: number, locale: Locale) =>
  page > 1 ? fill(browseText(locale).titlePage, { title, page: formatNumber(page, locale) }) : title

export function inKanaOrder(total: number, page: number, pages: number, locale: Locale) {
  const { inKanaOrder: plain, inKanaOrderPaged } = browseText(locale).counts
  return counted(pages > 1 ? inKanaOrderPaged : plain, total, locale, {
    page: formatNumber(page, locale),
    pages: formatNumber(pages, locale)
  })
}

const lowerFirst = (name: string) => name.charAt(0).toLowerCase() + name.slice(1)

function nameForms(category: BrowseCategory, locale: Locale) {
  const name = categoryName(category, locale)
  return { name, lower: lowerFirst(name), bare: lowerFirst(name.replace(/^The /u, '')) }
}

const bySlug = (
  texts: Readonly<Record<string, string>>
): Readonly<Partial<Record<string, string>>> => texts

export function categoryHeading(category: BrowseCategory, locale: Locale): string {
  const { heading, headings } = browseText(locale).category
  return (
    bySlug(headings)[category.slug] ?? fill(heading[category.kind], nameForms(category, locale))
  )
}

export const categoryDescription = (slug: string, locale: Locale): string | undefined =>
  bySlug(getDictionary(locale).categoryIntros)[slug]

export function categoryIntro(
  category: BrowseCategory,
  total: number,
  order: CategoryOrder,
  locale: Locale
): string {
  const { intro, marks } = browseText(locale).category
  const forms = nameForms(category, locale)
  const first = counted(intro[category.kind][order], total, locale, {
    ...forms,
    marks: bySlug(marks)[category.slug] ?? forms.lower
  })
  return joinSentences([first, categoryDescription(category.slug, locale)], locale)
}

export const orderName = (order: CategoryOrder, locale: Locale) =>
  browseText(locale).category.orders[order]

export interface RankedListCopy {
  description: string
  unranked?: string
  sources: SourceCredit[]
}

type FrequencyText = Dictionary['browse']['frequency']
type RankedSlug = keyof FrequencyText['ranked']
type RankedListSources = { unranked?: keyof FrequencyText['unranked']; sources: SourceCredit[] }

const jiten: RankedListSources = {
  unranked: 'jiten',
  sources: [sourceCredits.jmdict, sourceCredits.jiten]
}

const rankedLists: Record<RankedSlug, RankedListSources> = {
  youtube: { sources: [sourceCredits.jmdict, sourceCredits.tubelex] },
  wikipedia: { unranked: 'wikipedia', sources: [sourceCredits.jmdict, sourceCredits.wikipedia] },
  'tv-and-movies': jiten,
  anime: jiten,
  manga: jiten,
  novels: jiten,
  'visual-novels': jiten,
  'video-games': jiten
}

const isRankedSlug = (slug: string): slug is RankedSlug => Object.hasOwn(rankedLists, slug)

export function rankedListCopy(slug: string, locale: Locale): RankedListCopy | undefined {
  if (!isRankedSlug(slug)) return undefined
  const { ranked, unranked } = browseText(locale).frequency
  const list = rankedLists[slug]
  return {
    description: ranked[slug],
    ...(list.unranked ? { unranked: unranked[list.unranked] } : {}),
    sources: list.sources
  }
}

const primarySchoolYears = 6
const secondarySchoolGrade = 8

type KanjiListKind = 'strokes' | 'jlpt' | 'grade' | 'secondary' | 'jinmeiyo'

function kanjiListKind(list: KanjiList): KanjiListKind {
  const grades = list.grades ?? []
  const [grade] = grades
  if (list.strokes !== undefined) return 'strokes'
  if (list.jlptLevel !== undefined) return 'jlpt'
  if (grades.length === 1 && grade <= primarySchoolYears) return 'grade'
  return grade === secondarySchoolGrade ? 'secondary' : 'jinmeiyo'
}

export const kanjiListName = (list: KanjiList, locale: Locale) => coreText(list.name, locale)

export function kanjiListHeading(list: KanjiList, locale: Locale): string {
  return fill(browseText(locale).kanji.heading[kanjiListKind(list)], {
    name: kanjiListName(list, locale),
    grade: list.grades?.[0] ?? '',
    strokes: list.strokes ?? '',
    level: list.jlptLevel ?? ''
  })
}

function kanjiListFirstSentence(list: KanjiList, total: number, locale: Locale): string {
  const { intro } = browseText(locale).kanji
  const count = formatNumber(total, locale)
  const kind = kanjiListKind(list)
  const grade = bySlug(intro.grade)[String(list.grades?.[0])]
  if (kind === 'strokes') {
    const strokes = list.strokes ?? 0
    return fill(pluralOf(intro.strokes, strokes, locale), {
      count,
      strokes: formatNumber(strokes, locale)
    })
  }
  if (kind === 'jlpt') return fill(intro.jlpt, { count, level: list.jlptLevel ?? '' })
  if (kind === 'grade' && grade) return fill(grade, { count })
  return fill(kind === 'secondary' ? intro.secondary : intro.jinmeiyo, { count })
}

export function kanjiListIntro(list: KanjiList, total: number, locale: Locale): string {
  const { jlptEstimate, opensSearch } = browseText(locale).kanji
  return joinSentences(
    [
      kanjiListFirstSentence(list, total, locale),
      list.jlptLevel === undefined ? null : jlptEstimate,
      opensSearch
    ],
    locale
  )
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

export function rankRange({ first, last }: Ranks, locale: Locale): string {
  return fill(browseText(locale).frequency.rankRange, {
    first: formatNumber(first, locale),
    last: formatNumber(last, locale)
  })
}

export const rankBandTitle = (name: string, ranks: Ranks, locale: Locale) =>
  fill(browseText(locale).frequency.bandTitle, { name, range: rankRange(ranks, locale) })

const thousands = (rank: number) => `${rank / rankBandSize}k`

export function shortBandLabel(band: RankBand, locale: Locale): string {
  return fill(browseText(locale).frequency.bandShort, {
    from: band.first === 1 ? '1' : thousands(band.first - 1),
    to: thousands(band.last),
    upTo: new Intl.NumberFormat(locale, { notation: 'compact' }).format(band.last)
  })
}

const tierOrder: Record<FrequencyTier, number> = {
  veryCommon: 0,
  common: 1,
  moderate: 2,
  uncommon: 3,
  rare: 4
}
const highestRankChecked = 1_000_000

function lastRankOf(tier: FrequencyTier): number {
  const atMost = (rank: number) => tierOrder[tierForRank(rank)] <= tierOrder[tier]
  let low = 1
  let high = highestRankChecked
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (atMost(middle)) low = middle
    else high = middle - 1
  }
  return low
}

export const legendTiers = [
  'veryCommon',
  'common',
  'moderate',
  'uncommon'
] as const satisfies readonly Exclude<FrequencyTier, 'rare'>[]

export const tierName = (tier: (typeof legendTiers)[number], locale: Locale) =>
  browseText(locale).frequency.tierNames[tier]

export function tierCutoffs(locale: Locale): string {
  const { tierCutoffs: sentence, tierCutoff } = browseText(locale).frequency
  const tiers = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    legendTiers.map(tier =>
      fill(tierCutoff, {
        tier: tierName(tier, locale).toLowerCase(),
        rank: formatNumber(lastRankOf(tier), locale)
      })
    )
  )
  return fill(sentence, { tiers })
}

export const jlptCopy = (locale: Locale): RankedListCopy => ({
  description: browseText(locale).frequency.jlptDescription,
  sources: [sourceCredits.jmdict, sourceCredits.jlpt]
})
