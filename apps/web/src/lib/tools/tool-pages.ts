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
import { type FuriganaTool, furiganaTool } from './furigana-tool'
import { type ConverterSlug, converterPath, furiganaSlug, type ToolSlug, toolsPath } from './paths'

type ToolsText = Dictionary['tools']

interface NamedTool extends SitePage {
  name: string
  from: string
  to: string
  lead: string
}

export interface ConverterPage extends Omit<Converter, 'card'>, NamedTool {
  card: Converter['card'] & { line: string }
}

export interface FuriganaPage extends Omit<FuriganaTool, 'card'>, NamedTool {
  slug: typeof furiganaSlug
  card: FuriganaTool['card'] & { line: string }
}

function namedTool(slug: ToolSlug, locale: Locale): NamedTool & { line: string } {
  const t = getDictionary(locale).tools
  const { from, to, description, lead, card } = t.converters[slug]
  const name = fill(t.names.name, { from, to })
  return {
    path: converterPath(slug),
    name,
    title: fill(t.names.title, { name, from, to }),
    description,
    from,
    to,
    lead,
    line: card
  }
}

function pageOf(converter: Converter, locale: Locale): ConverterPage {
  const { line, ...named } = namedTool(converter.slug, locale)
  return { ...converter, ...named, card: { ...converter.card, line } }
}

export function furiganaPageIn(locale: Locale): FuriganaPage {
  const { line, ...named } = namedTool(furiganaSlug, locale)
  return { ...furiganaTool, ...named, slug: furiganaSlug, card: { ...furiganaTool.card, line } }
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
  ...converterPagesIn(locale),
  furiganaPageIn(locale)
]

export function howItWorksIn(slug: ToolSlug, locale: Locale): RichText[] {
  const { first, second } = getDictionary(locale).tools.howItWorks[slug]
  return [first, second].map(richText)
}

type QuestionSet = ConverterPair | 'furigana'

const questionOrder: { [Set in QuestionSet]: readonly (keyof ToolsText['questions'][Set])[] } = {
  kana: ['kanjiAndLetters', 'longMark', 'katakana'],
  romaji: ['n', 'smallTsu', 'romanization'],
  width: ['halfWidthKatakana', 'forms', 'hiragana'],
  furigana: ['context', 'limit', 'paste']
}

export function questionsIn(pair: QuestionSet, locale: Locale): Question[] {
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
