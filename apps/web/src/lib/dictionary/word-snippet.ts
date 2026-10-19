import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { countOf, fill } from '@/lib/i18n/format'
import { site } from '@/lib/site'
import {
  capitalized,
  characters,
  descriptionLength,
  fitsTitle,
  fittedDescription
} from '@/lib/snippets'
import { plainRomaji } from './plain-romaji'

export interface SnippetWord {
  headword: string
  reading: string
  summary: string
  partOfSpeech: string
  pitch: object | null
  kanji: readonly unknown[]
  conjugations: object | null
  exampleCount: { listed: number } | null
  examples: readonly unknown[]
}

const features = ['reading', 'meanings', 'pitch', 'kanji', 'conjugations', 'examples'] as const

type Feature = (typeof features)[number]

const droppedInTurn: readonly Feature[] = ['meanings', 'reading', 'kanji', 'pitch', 'conjugations']

const glossSeparator = ', '

const metadataText = (locale: Locale) => getDictionary(locale).word.metadata

const listedExamples = (word: SnippetWord) => word.exampleCount?.listed ?? 0

const hasExamples = (word: SnippetWord) => listedExamples(word) > 0 && word.examples.length > 0

const opening = new Set(['(', '（'])
const closing = new Set([')', '）'])

function topLevelGlosses(summary: string): string[] {
  const glosses: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < summary.length; index += 1) {
    const unit = summary[index]
    if (opening.has(unit)) depth += 1
    else if (closing.has(unit)) depth = Math.max(0, depth - 1)
    else if (depth === 0 && summary.startsWith(glossSeparator, index)) {
      glosses.push(summary.slice(start, index))
      start = index + glossSeparator.length
    }
  }
  return [...glosses, summary.slice(start)]
}

function wordName(word: SnippetWord, locale: Locale) {
  return word.reading === word.headword
    ? word.headword
    : fill(metadataText(locale).word, { headword: word.headword, reading: word.reading })
}

const titleOrder = ['first', 'second', 'third', 'fourth'] as const

function titleFeatures(word: SnippetWord, locale: Locale) {
  const t = metadataText(locale).titleFeatures
  return [
    t.meaning,
    word.kanji.length > 0 ? t.kanji : '',
    hasExamples(word) ? t.examples : ''
  ].join('')
}

export function wordTitle(word: SnippetWord, locale: Locale): string {
  const t = metadataText(locale)
  const latin = plainRomaji(word.reading)
  const values = {
    romaji: latin ? capitalized(latin) : '',
    word: wordName(word, locale),
    headword: word.headword,
    gloss: topLevelGlosses(word.summary)[0],
    features: titleFeatures(word, locale)
  }
  const searched = titleOrder
    .map(key => t.titles[key])
    .filter(template => latin !== null || !template.includes('{romaji}'))
    .map(template => fill(template, values))
  const plain = hasExamples(word) ? t.titleWithExamples : t.title
  const titles = [
    ...searched,
    fill(plain, { word: values.word }),
    fill(plain, { word: word.headword })
  ]
  return titles.find(fitsTitle) ?? titles[titles.length - 1]
}

function wordLead(word: SnippetWord, locale: Locale): string {
  const t = metadataText(locale)
  const partOfSpeech = coreText(word.partOfSpeech, locale)
  const template = partOfSpeech ? t.descriptionWithPartOfSpeech : t.description
  const latin = plainRomaji(word.reading)
  const glosses = topLevelGlosses(word.summary)
  const named = (name: string) =>
    glosses.map((_, dropped) =>
      fill(template, {
        word: name,
        meaning: glosses.slice(0, glosses.length - dropped).join(glossSeparator),
        partOfSpeech
      })
    )
  const plain = named(wordName(word, locale))
  const asked = latin ? plain.map(lead => fill(t.asked, { romaji: latin, lead })) : []
  const leads = [...asked, ...plain, ...named(word.headword)]
  return (
    leads.find(lead => characters(lead) <= descriptionLength.longest) ?? leads[leads.length - 1]
  )
}

function featureName(feature: Feature, word: SnippetWord, locale: Locale) {
  const names = metadataText(locale).featureNames
  return feature === 'examples'
    ? countOf(names.examples, listedExamples(word), locale)
    : names[feature]
}

function shownFeatures(word: SnippetWord): Feature[] {
  const shown: Record<Feature, boolean> = {
    reading: true,
    meanings: true,
    pitch: word.pitch !== null,
    kanji: word.kanji.length > 0,
    conjugations: word.conjugations !== null,
    examples: listedExamples(word) > 0
  }
  return features.filter(feature => shown[feature])
}

function featureSentences(word: SnippetWord, locale: Locale): string[] {
  const list = new Intl.ListFormat(locale, { type: 'conjunction' })
  const shown = shownFeatures(word)
  const sets = Array.from({ length: droppedInTurn.length + 1 }, (_, dropped) =>
    shown.filter(feature => !droppedInTurn.slice(0, dropped).includes(feature))
  )
  const sentences = sets
    .filter(set => set.length > 0)
    .map(set =>
      fill(metadataText(locale).features, {
        name: site.name,
        features: list.format(set.map(feature => featureName(feature, word, locale)))
      })
    )
  return [...new Set(sentences)]
}

export const wordDescription = (word: SnippetWord, locale: Locale) =>
  fittedDescription(wordLead(word, locale), [featureSentences(word, locale)], locale)
