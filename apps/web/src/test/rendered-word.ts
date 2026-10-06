import type {
  SuiteFrequencyDetails,
  SuiteFurigana,
  SuitePitchGraph
} from '@zenbu/dictionary-core/detail/suite'
import { htmlText, withoutScreenReaderText } from './rendered'

function textWithFurigana(html: string): string {
  return htmlText(html, { furigana: true }).trim()
}

function attribute(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

export function readFurigana(html: string, size = 'text-5xl'): SuiteFurigana[] {
  const headword = html.match(
    new RegExp(
      `<span lang="ja" class="[^"]*${size}[^"]*">([\\s\\S]*?)</span>(?:</h1>)?<(?:button|div)`
    )
  )
  if (!headword) throw new Error('No headword in the rendered header')
  const unhighlighted = headword[1].replace(endingSpan, '$1')
  const segments = unhighlighted.matchAll(/<span>([^<]*)<\/span>|<ruby([^>]*)>([\s\S]*?)<\/ruby>/g)
  return [...segments].map(([, plain, rubyAttributes, ruby]): SuiteFurigana => {
    if (plain !== undefined) return { base: textWithFurigana(plain) }
    const [, base, reading] = ruby.match(/^([\s\S]*)<rt[^>]*>([\s\S]*)<\/rt>$/) ?? []
    const toggles = [...base.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)]
    if (toggles.length === 0)
      return { base: textWithFurigana(base), reading: textWithFurigana(reading) }
    const parts = [...reading.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map(([, part]) => part)
    const toggleParts = toggles.map(([, tag]) => attribute(tag, 'data-kanji-reading'))
    if (toggleParts.some((part, index) => part !== parts[index])) {
      throw new Error(`The toggles (${toggleParts}) and the furigana (${parts}) disagree`)
    }
    if (attribute(rubyAttributes, 'data-kanji-split') !== parts.join('・')) {
      throw new Error('The run’s split and its furigana disagree')
    }
    return {
      base: toggles.map(([, , character]) => character).join(''),
      reading: parts.join(''),
      kanjiReadings: parts
    }
  })
}

export function readPitchGraph(html: string): SuitePitchGraph | null {
  const graph = html.match(
    /<span[^>]*data-pitch-graph[^>]*>([\s\S]*?)<svg([^>]*)>([\s\S]*?)<\/svg>/
  )
  if (!graph) return null
  const [, moraHtml, svgAttributes, svg] = graph
  const viewHeight = Number((attribute(svgAttributes, 'viewBox') ?? '').split(' ')[3])
  const morae = [...moraHtml.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map(([, mora]) => mora)
  const circles = [...svg.matchAll(/<circle([^>]*)>/g)].map(([, tag]) => ({
    x: Number(attribute(tag, 'cx')),
    level: Number(attribute(tag, 'cy')) < viewHeight / 2 ? 'H' : 'L',
    particle: attribute(tag, 'data-particle') !== null
  }))
  const point = ({ x, level }: { x: number; level: string }) => ({ x, level })
  const particle = circles.find(circle => circle.particle)
  if (!particle) throw new Error('The pitch graph has no particle dot')
  return {
    morae,
    points: circles.filter(circle => !circle.particle).map(point),
    particle: point(particle)
  }
}

export function readFrequencyDetails(html: string): SuiteFrequencyDetails {
  const [, packHtml, sectionHtml] =
    html.match(
      /data-details-section="pack">([\s\S]*?)<\/section><section[^>]*data-details-section="[^"]*">([\s\S]*?)<\/section>/
    ) ?? []
  if (packHtml === undefined) throw new Error('No Frequency Details')
  const definitions = (source: string) =>
    Object.fromEntries(
      [...source.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)].map(
        ([, term, value]) => [textWithFurigana(term), textWithFurigana(value)]
      )
    )
  const pack = definitions(packHtml)
  const rows = [...sectionHtml.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)].map(
    ([, label, value]) => ({ label: textWithFurigana(label), value: textWithFurigana(value) })
  )
  const explanation = sectionHtml.match(/<p data-details-explanation="true">([\s\S]*?)<\/p>/)?.[1]
  return {
    pack: {
      name: textWithFurigana(packHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
      domain: pack.Domain,
      description: textWithFurigana(packHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''),
      version: pack.Version,
      source: pack.Source
    },
    section: textWithFurigana(sectionHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
    rows,
    ...(explanation === undefined ? {} : { explanation: textWithFurigana(explanation) })
  }
}

const endingSpan = /<span class="[^"]*" data-ending="true">([^<]*)<\/span>/g

function endings(html: string): string {
  return [...html.matchAll(endingSpan)].map(([, ending]) => ending).join('')
}

function visible(html: string): string {
  return htmlText(html).trim()
}

export interface RenderedConjugatedForm {
  explanation: string
  sharedSpelling: string | null
  furigana: SuiteFurigana[]
  ending: string
}

interface RenderedConjugationRow {
  kind: string
  title: string
  surface: string
  ending: string
  rowFurigana: boolean
}

interface RenderedConjugationRegister {
  hidden: boolean
  rows: RenderedConjugationRow[]
  forms: RenderedConjugatedForm[]
}

export interface RenderedConjugationTable {
  rule: string
  modes: string[]
  registers: Record<string, RenderedConjugationRegister>
}

function markedSlices(html: string, marker: RegExp): { match: RegExpExecArray; html: string }[] {
  const matches = [...html.matchAll(marker)]
  return matches.map((match, index) => ({
    match,
    html: html.slice(match.index, matches[index + 1]?.index ?? html.length)
  }))
}

const conjugationRowSummary =
  /^<div[^>]*data-conjugation-row="([^"]+)"[^>]*><button[^>]*><span class="text-muted-foreground">([^<]*)<\/span><span[^>]*data-conjugation-surface="true">([\s\S]*?)<\/span><svg/

function readConjugationRegister(html: string): RenderedConjugationRegister {
  const rows = markedSlices(html, /<div[^>]*data-conjugation-row="/g).map(row => {
    const summary = row.html.match(conjugationRowSummary)
    if (!summary) throw new Error('A conjugation row has no title and surface')
    const [, kind, title, surface] = summary
    return {
      row: {
        kind,
        title,
        surface: visible(surface),
        ending: endings(surface),
        rowFurigana: surface.includes('<ruby')
      },
      form: readConjugatedForm(row.html.slice(summary[0].length))
    }
  })
  return {
    hidden: attribute(html.match(/^<ul([^>]*)>/)?.[1] ?? '', 'hidden') !== null,
    rows: rows.map(({ row }) => row),
    forms: rows.map(({ form }) => form)
  }
}

export function readConjugationTable(html: string): RenderedConjugationTable {
  const modes = [...html.matchAll(/data-conjugation-mode="([^"]+)"/g)].map(([, mode]) => mode)
  const registers = markedSlices(html, /<ul[^>]*data-conjugation-rows="([^"]+)"/g).map(
    ({ match, html: register }) => [match[1], readConjugationRegister(register)] as const
  )
  return {
    rule: textWithFurigana(html.match(/data-conjugation-rule="true">([\s\S]*?)<\/p>/)?.[1] ?? ''),
    modes: modes.length > 0 ? modes : ['Plain'],
    registers: Object.fromEntries(registers)
  }
}

export function readConjugatedForm(html: string): RenderedConjugatedForm {
  const shared = html.match(/data-shared-spelling="true">(?:<svg[\s\S]*?<\/svg>)?([\s\S]*?)<\/p>/)
  const headline = html.match(/<span lang="ja" class="[^"]*text-4xl[^"]*">[\s\S]*?<\/span><button/)
  return {
    explanation: textWithFurigana(
      html.match(/data-conjugation-explanation="true">([\s\S]*?)<\/p>/)?.[1] ?? ''
    ),
    sharedSpelling: shared ? textWithFurigana(shared[1]) : null,
    furigana: readFurigana(html, 'text-4xl'),
    ending: endings(headline?.[0] ?? '')
  }
}

export interface RenderedExample {
  pairId: string
  tokens: { surface: string; href: string | null; highlighted: boolean }[]
}

const exampleToken =
  /(<a([^>]*)>)?<span lang="ja"([^>]*)>((?:<span>[^<]*<\/span>|<ruby>[^<]*<rt[^>]*>[^<]*<\/rt><\/ruby>)*)<\/span>(?:<\/a>)?/g

export function readExamples(html: string): RenderedExample[] {
  const items = [...html.matchAll(/<li[^>]*data-example-pair="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)]
  return items.map(([, pairId, item]) => {
    const sentence = item.match(/<p lang="ja"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''
    const tokens = [...sentence.matchAll(exampleToken)].map(([, link, linkTag, span, inner]) => ({
      surface: htmlText(inner),
      href: link ? attribute(linkTag, 'href') : null,
      highlighted: attribute(span, 'data-page-word') === 'true'
    }))
    if (tokens.map(token => token.surface).join('') !== htmlText(sentence)) {
      throw new Error(`Could not read the words of ${htmlText(sentence)}`)
    }
    return { pairId, tokens }
  })
}

export function readFrequencyRows(html: string): { name: string; text: string }[] {
  const shown = withoutScreenReaderText(html)
  return [...shown.matchAll(/data-frequency-row="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)].map(
    ([, name, row]) => ({
      name,
      text: textWithFurigana(row.match(/<span class="ml-auto[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? '')
    })
  )
}
