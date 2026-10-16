import type { BrowseCategory } from '@zenbu/dictionary-core/browse/categories'
import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { japaneseCategoryNames, japaneseSubjects } from './category-names-ja'

const coreLanguage = 'en' satisfies Locale

const categoryChips: Readonly<Record<string, string>> = {
  nouns: 'Noun',
  pronouns: 'Pronoun',
  'suru-verbs': 'する verb',
  'godan-verbs': 'Godan verb',
  'ichidan-verbs': 'Ichidan verb',
  'transitive-verbs': 'transitive',
  'intransitive-verbs': 'intransitive',
  'auxiliary-verbs': 'Auxiliary verb',
  'i-adjectives': 'I-adjective',
  'na-adjectives': 'Na-adjective',
  'no-adjectives': 'Noun (の)',
  'taru-adjectives': 'Taru adjective',
  'pre-noun-adjectives': 'Pre-noun adjective',
  adverbs: 'Adverb',
  expressions: 'Expression',
  interjections: 'Interjection',
  conjunctions: 'Conjunction',
  particles: 'Particle',
  counters: 'Counter',
  prefixes: 'Prefix',
  suffixes: 'Suffix',
  numbers: 'Number',
  'honorific-language': 'Honorific',
  'humble-language': 'Humble',
  colloquialisms: 'Colloquial',
  'archaic-words': 'Archaic',
  'obsolete-words': 'Obsolete',
  'kana-words': 'Usually written in kana'
}

const ownNames: Record<
  Exclude<Locale, typeof coreLanguage>,
  (slug: string) => { name: string; reading?: string } | undefined
> = {
  ja: slug => {
    const name = japaneseCategoryNames[slug]
    return name ? { name } : japaneseSubjects[slug]
  }
}

export function categoryName(category: BrowseCategory, locale: Locale): string {
  if (locale === coreLanguage) return category.name
  const chip = categoryChips[category.slug]
  if (chip) return coreText(chip, locale)
  return ownNames[locale](category.slug)?.name ?? category.name
}

export function categorySortName(category: BrowseCategory, locale: Locale): string {
  if (locale === coreLanguage) return category.name
  return ownNames[locale](category.slug)?.reading ?? categoryName(category, locale)
}
