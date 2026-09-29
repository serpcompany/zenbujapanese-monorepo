// Reads what a rendered word page shows, from its server-rendered HTML, into the word-detail
// suite's shapes (src/lib/dictionary/detail/suite.ts), for the rendered-page test
// (word-page.test.tsx): the headword's furigana and per-kanji split, the pitch graph's points,
// and a Frequency row's details. It reads the drawing itself (each dot's position), not the data
// the page was given. Test-only.

import type {
  SuiteFrequencyDetails,
  SuiteFurigana,
  SuitePitchGraph
} from '@/lib/dictionary/detail/suite'

/**
 * Text with tags removed and the entities React writes decoded. Tags are stripped until none
 * remain, so a removal can't leave a new tag behind. `&lt;` and `&gt;` stay encoded, so the result
 * never holds a tag.
 */
function text(html: string): string {
  let stripped = html
  let previous: string
  do {
    previous = stripped
    stripped = stripped.replace(/<[^>]*>/g, '')
  } while (stripped !== previous)
  return stripped
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;(?!lt;|gt;)/g, '&')
    .trim()
}

function attribute(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

/**
 * The headword's furigana, segment by segment: a plain run, a `<ruby>` with its reading, or a
 * `<ruby>` whose kanji are toggles, each with its own part of the reading.
 */
export function readFurigana(html: string, size = 'text-5xl'): SuiteFurigana[] {
  const headword = html.match(
    new RegExp(`<span lang="ja" class="[^"]*${size}[^"]*">([\\s\\S]*?)</span><(?:button|div)`)
  )
  if (!headword) throw new Error('No headword in the rendered header')
  // A highlighted ending is its own span; its text reads as part of its segment.
  const unhighlighted = headword[1].replace(endingSpan, '$1')
  const segments = unhighlighted.matchAll(/<span>([^<]*)<\/span>|<ruby([^>]*)>([\s\S]*?)<\/ruby>/g)
  return [...segments].map(([, plain, rubyAttributes, ruby]): SuiteFurigana => {
    if (plain !== undefined) return { base: text(plain) }
    const [, base, reading] = ruby.match(/^([\s\S]*)<rt[^>]*>([\s\S]*)<\/rt>$/) ?? []
    const toggles = [...base.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)]
    if (toggles.length === 0) return { base: text(base), reading: text(reading) }
    // Each toggle names the kanji and its part, and the furigana draws each part in its own span.
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

/**
 * The pitch graph as drawn: the morae, then each dot's `cx` (hundredths of a mora width, the
 * SVG's unit) and whether it sits in the top half (high) or the bottom half (low).
 */
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

/** Frequency Details, as FrequencyDetailsContent draws it. */
export function readFrequencyDetails(html: string): SuiteFrequencyDetails {
  const [, packHtml, sectionHtml] =
    html.match(
      /data-details-section="pack">([\s\S]*?)<\/section><section[^>]*data-details-section="[^"]*">([\s\S]*?)<\/section>/
    ) ?? []
  if (packHtml === undefined) throw new Error('No Frequency Details')
  const definitions = (source: string) =>
    Object.fromEntries(
      [...source.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)].map(
        ([, term, value]) => [text(term), text(value)]
      )
    )
  const pack = definitions(packHtml)
  const rows = [...sectionHtml.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)].map(
    ([, label, value]) => ({ label: text(label), value: text(value) })
  )
  const explanation = sectionHtml.match(/<p data-details-explanation="true">([\s\S]*?)<\/p>/)?.[1]
  return {
    pack: {
      name: text(packHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
      domain: pack.Domain,
      description: text(packHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''),
      version: pack.Version,
      source: pack.Source
    },
    section: text(sectionHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''),
    rows,
    ...(explanation === undefined ? {} : { explanation: text(explanation) })
  }
}

/** A highlighted ending, drawn in the accent color. */
const endingSpan = /<span class="[^"]*" data-ending="true">([^<]*)<\/span>/g

/** The text drawn in the accent color as a changed ending. */
function endings(html: string): string {
  return [...html.matchAll(endingSpan)].map(([, ending]) => ending).join('')
}

/** Visible text: furigana left out. */
function visible(html: string): string {
  return text(html.replace(/<rt[^>]*>[\s\S]*?<\/rt>/g, ''))
}

export interface RenderedConjugationTable {
  summary: string
  rule: string
  modes: string[]
  rows: {
    kind: string
    title: string
    surface: string
    ending: string
    rowFurigana: boolean
  }[]
}

/** The conjugation table as drawn: its header, the register control, and each row. */
export function readConjugationTable(html: string): RenderedConjugationTable {
  const field = (name: string) =>
    text(html.match(new RegExp(`${name}="true">([\\s\\S]*?)</p>`))?.[1] ?? '')
  const modes = [...html.matchAll(/data-conjugation-mode="([^"]+)"/g)].map(([, mode]) => mode)
  const rows = [
    ...html.matchAll(
      /data-conjugation-row="([^"]+)"[^>]*><span class="text-muted-foreground">([^<]*)<\/span><span[^>]*data-conjugation-surface="true">([\s\S]*?)<\/span><svg/g
    )
  ].map(([, kind, title, surface]) => ({
    kind,
    title,
    surface: visible(surface),
    ending: endings(surface),
    rowFurigana: surface.includes('<ruby')
  }))
  return {
    summary: field('data-conjugation-summary'),
    rule: field('data-conjugation-rule'),
    modes: modes.length > 0 ? modes : ['Plain'],
    rows
  }
}

/** A conjugated form's screen as drawn. */
export function readConjugatedForm(html: string): {
  explanation: string
  sharedSpelling: string | null
  furigana: SuiteFurigana[]
  ending: string
} {
  const shared = html.match(/data-shared-spelling="true">(?:<svg[\s\S]*?<\/svg>)?([\s\S]*?)<\/p>/)
  const headline = html.match(/<span lang="ja" class="[^"]*text-4xl[^"]*">[\s\S]*?<\/span><button/)
  return {
    explanation: text(html.match(/data-conjugation-explanation="true">([\s\S]*?)<\/p>/)?.[1] ?? ''),
    sharedSpelling: shared ? text(shared[1]) : null,
    furigana: readFurigana(html, 'text-4xl'),
    ending: endings(headline?.[0] ?? '')
  }
}

/** The Frequency rows as listed: each dictionary's name and value, as a reader sees them. */
export function readFrequencyRows(html: string): { name: string; text: string }[] {
  // Screen-reader-only text, such as a rank's spoken tier, is left out first.
  const shown = html.replace(/<span class="sr-only">[^<]*<\/span>/g, '')
  return [...shown.matchAll(/data-frequency-row="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)].map(
    ([, name, row]) => ({
      name,
      text: text(row.match(/<span class="ml-auto[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? '')
    })
  )
}
