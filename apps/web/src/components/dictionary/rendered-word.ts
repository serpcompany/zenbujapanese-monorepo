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
export function readFurigana(html: string): SuiteFurigana[] {
  const headword = html.match(
    /<span lang="ja" class="[^"]*text-5xl[^"]*">([\s\S]*?)<\/span><(?:button|div)/
  )
  if (!headword) throw new Error('No headword in the rendered header')
  const segments = headword[1].matchAll(/<span>([^<]*)<\/span>|<ruby([^>]*)>([\s\S]*?)<\/ruby>/g)
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
