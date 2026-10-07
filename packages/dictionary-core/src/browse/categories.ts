import { subjects } from './subjects'

export type CategoryKind = 'partOfSpeech' | 'usage' | 'subject' | 'dialect' | 'common'

export const categoryOrders = ['used', 'kana'] as const

export type CategoryOrder = (typeof categoryOrders)[number]

export const isCategoryOrder = (value: string): value is CategoryOrder =>
  (categoryOrders as readonly string[]).includes(value)

export interface BrowseCategory {
  slug: string
  kind: CategoryKind
  labels: readonly string[]
  name: string
}

const category =
  (kind: CategoryKind) =>
  (slug: string, name: string, ...labels: string[]): BrowseCategory => ({
    slug,
    kind,
    labels,
    name
  })

const partOfSpeech = category('partOfSpeech')
const usage = category('usage')
const dialect = category('dialect')

const partsOfSpeech = [
  partOfSpeech('nouns', 'Nouns', 'noun'),
  partOfSpeech('pronouns', 'Pronouns', 'pronoun'),
  partOfSpeech('suru-verbs', 'Suru verbs', 'takesSuru', 'suruVerb'),
  partOfSpeech('godan-verbs', 'Godan verbs', 'godanVerb'),
  partOfSpeech('ichidan-verbs', 'Ichidan verbs', 'ichidanVerb'),
  partOfSpeech('irregular-verbs', 'Irregular verbs', 'kuruVerb', 'zuruVerb'),
  partOfSpeech('transitive-verbs', 'Transitive verbs', 'transitive'),
  partOfSpeech('intransitive-verbs', 'Intransitive verbs', 'intransitive'),
  partOfSpeech('auxiliary-verbs', 'Auxiliary verbs', 'auxiliaryVerb'),
  partOfSpeech('i-adjectives', 'I-adjectives', 'iAdjective'),
  partOfSpeech('na-adjectives', 'Na-adjectives', 'naAdjective'),
  partOfSpeech('no-adjectives', 'No-adjectives', 'noAdjective'),
  partOfSpeech('taru-adjectives', 'Taru adjectives', 'taruAdjective'),
  partOfSpeech('pre-noun-adjectives', 'Pre-noun adjectives', 'preNounAdjective'),
  partOfSpeech('adverbs', 'Adverbs', 'adverb', 'adverbTo'),
  partOfSpeech('expressions', 'Expressions', 'expression'),
  partOfSpeech('interjections', 'Interjections', 'interjection'),
  partOfSpeech('conjunctions', 'Conjunctions', 'conjunction'),
  partOfSpeech('particles', 'Particles', 'particle'),
  partOfSpeech('counters', 'Counters', 'counter'),
  partOfSpeech('prefixes', 'Prefixes', 'prefix', 'nounPrefix'),
  partOfSpeech('suffixes', 'Suffixes', 'suffix', 'nounSuffix'),
  partOfSpeech('numbers', 'Numbers', 'numeric')
]

const usageLabels = [
  usage('onomatopoeia', 'Onomatopoeia', 'onomatopoeic'),
  usage('yojijukugo', 'Yojijukugo', 'yojijukugo'),
  usage('proverbs', 'Proverbs', 'proverb'),
  usage('idioms', 'Idioms', 'idiomatic'),
  usage('honorific-language', 'Honorific language', 'honorific'),
  usage('humble-language', 'Humble language', 'humble'),
  usage('polite-language', 'Polite language', 'polite'),
  usage('slang', 'Slang', 'slang'),
  usage('internet-slang', 'Internet slang', 'internetSlang'),
  usage('manga-slang', 'Manga slang', 'mangaSlang'),
  usage('colloquialisms', 'Colloquialisms', 'colloquial'),
  usage('familiar-language', 'Familiar language', 'familiar'),
  usage('formal-language', 'Formal and literary words', 'formal'),
  usage('poetic-words', 'Poetic words', 'poetic'),
  usage('childrens-language', "Children's language", 'childrensLanguage'),
  usage('feminine-language', 'Feminine language', 'feminine'),
  usage('masculine-language', 'Masculine language', 'masculine'),
  usage('jocular-words', 'Jocular words', 'jocular'),
  usage('euphemisms', 'Euphemisms', 'euphemistic'),
  usage('abbreviations', 'Abbreviations', 'abbreviation'),
  usage('archaic-words', 'Archaic words', 'archaic'),
  usage('obsolete-words', 'Obsolete words', 'obsolete'),
  usage('dated-words', 'Dated words', 'dated'),
  usage('historical-terms', 'Historical terms', 'historical'),
  usage('kana-words', 'Words usually written in kana', 'usuallyKana')
]

const dialects = [
  dialect('kansai-dialect', 'Kansai dialect', 'kansai'),
  dialect('osaka-dialect', 'Osaka dialect', 'osaka'),
  dialect('kyoto-dialect', 'Kyoto dialect', 'kyoto'),
  dialect('tohoku-dialect', 'Tōhoku dialect', 'tohoku'),
  dialect('kanto-dialect', 'Kantō dialect', 'kanto'),
  dialect('kyushu-dialect', 'Kyūshū dialect', 'kyushu'),
  dialect('hokkaido-dialect', 'Hokkaidō dialect', 'hokkaido'),
  dialect('ryukyu-dialect', 'Ryūkyū dialect', 'ryukyu'),
  dialect('tosa-dialect', 'Tosa dialect', 'tosa'),
  dialect('tsugaru-dialect', 'Tsugaru dialect', 'tsugaru'),
  dialect('nagano-dialect', 'Nagano dialect', 'nagano'),
  dialect('brazilian-japanese', 'Brazilian Japanese', 'brazilian')
]

export const commonWords: BrowseCategory = {
  slug: 'common-words',
  kind: 'common',
  labels: [],
  name: 'Common words'
}

export const browseCategories: readonly BrowseCategory[] = [
  ...partsOfSpeech,
  ...usageLabels,
  ...dialects,
  ...subjects.map(({ slug, label, name }) => ({
    slug,
    kind: 'subject' as const,
    labels: [label],
    name
  })),
  commonWords
]

const bySlug = new Map(browseCategories.map(found => [found.slug, found]))

export function browseCategory(slug: string): BrowseCategory | undefined {
  return bySlug.get(slug)
}

export const senseLabelKeys: Record<'usage' | 'subject' | 'dialect', string> = {
  usage: 'usage',
  subject: 'fields',
  dialect: 'dialects'
}
