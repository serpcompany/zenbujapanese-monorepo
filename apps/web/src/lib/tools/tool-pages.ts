import type { Locale } from '@/lib/i18n/config'
import { type Dictionary, getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import type { SitePage } from '@/lib/pages'
import type { Question } from '@/lib/questions'
import {
  type Examples,
  type RichText,
  richText,
  spellingRuleExamples,
  typingTipExamples,
  type WidthRowShape,
  widthRowShapes
} from './content'
import { type Converter, type ConverterPair, converterFor, converters } from './converters'
import { type ConverterSlug, converterPath, toolsPath } from './paths'

type ToolsText = Dictionary['tools']

export interface ConverterPage extends Omit<Converter, 'card'>, SitePage {
  name: string
  from: string
  to: string
  lead: string
  card: Converter['card'] & { line: string }
}

function pageOf(converter: Converter, locale: Locale): ConverterPage {
  const t = getDictionary(locale).tools
  const { from, to, description, lead, card } = t.converters[converter.slug]
  const name = fill(t.names.name, { from, to })
  return {
    ...converter,
    path: converterPath(converter.slug),
    name,
    title: fill(t.names.title, { name, from, to }),
    description,
    from,
    to,
    lead,
    card: { ...converter.card, line: card }
  }
}

export const converterPagesIn = (locale: Locale) =>
  converters.map(converter => pageOf(converter, locale))

export const converterPageIn = (slug: ConverterSlug, locale: Locale) =>
  pageOf(converterFor(slug), locale)

export function toolsIndexIn(locale: Locale): SitePage {
  const { title, description } = getDictionary(locale).tools.index
  return { path: toolsPath, title, description }
}

export const toolPagesIn = (locale: Locale): SitePage[] => [
  toolsIndexIn(locale),
  ...converterPagesIn(locale)
]

export function howItWorksIn(slug: ConverterSlug, locale: Locale): RichText[] {
  const { first, second } = getDictionary(locale).tools.howItWorks[slug]
  return [first, second].map(richText)
}

const questionOrder: { [Pair in ConverterPair]: readonly (keyof ToolsText['questions'][Pair])[] } =
  {
    kana: ['kanjiAndLetters', 'longMark', 'katakana'],
    romaji: ['n', 'smallTsu', 'romanization'],
    width: ['halfWidthKatakana', 'forms', 'hiragana']
  }

export function questionsIn(pair: ConverterPair, locale: Locale): Question[] {
  const text: Record<string, Question> = getDictionary(locale).tools.questions[pair]
  return questionOrder[pair].map(key => text[key])
}

export interface SpellingRule {
  id: string
  label: string
  rule: string
  examples: Examples
  note?: string
}

type RuleText = { label: string; rule: string; note?: string }

function rulesOf(
  examples: Readonly<Record<string, Examples>>,
  text: Readonly<Record<string, RuleText>>
): SpellingRule[] {
  return Object.entries(examples).map(([id, shown]) => ({ id, ...text[id], examples: shown }))
}

export const typingTipsIn = (locale: Locale) =>
  rulesOf(typingTipExamples, getDictionary(locale).tools.reference.typingTips)

export const spellingRulesIn = (locale: Locale) =>
  rulesOf(spellingRuleExamples, getDictionary(locale).tools.reference.spellingRules)

export interface WidthRow extends WidthRowShape {
  kind: string
  note?: string
}

export function widthRowsIn(locale: Locale): WidthRow[] {
  const text: Readonly<Record<WidthRowShape['id'], { kind: string; note?: string }>> =
    getDictionary(locale).tools.reference.widthRows
  return widthRowShapes.map(row => ({ ...row, ...text[row.id] }))
}
