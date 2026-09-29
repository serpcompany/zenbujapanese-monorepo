// Reads what a rendered search results page shows, from its server-rendered HTML, for the
// rendered-page tests (search-results.test.tsx): the sections in order, the kanji row, and each
// word row's headword, meaning, and chips, as a reader sees them. Test-only.

/** Text only screen readers get, such as a chip's spoken tier. */
const srOnly = /<span class="sr-only">[\s\S]*?<\/span>/g

/** Visible text: furigana (`<rt>`) and screen-reader-only text left out, entities decoded. */
export function visibleText(html: string): string {
  return (
    html
      .replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/g, '')
      .replace(srOnly, '')
      // A block ends a line.
      .replace(/<\/(?:p|div|h\d)>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** The HTML from each match of `marker` to the next, with the marker's captured value. */
function segments(html: string, marker: RegExp): { value: string; html: string }[] {
  const matches = [...html.matchAll(marker)]
  return matches.map((match, index) => ({
    value: match[1],
    html: html.slice(match.index, matches[index + 1]?.index ?? html.length)
  }))
}

export interface RenderedRow {
  entSeq: number
  headword: string
  summary: string
  chips: string[]
}

export interface RenderedPage {
  /** `data-section` values, in document order. */
  sections: string[]
  refinement: string | null
  kanji: { character: string; text: string } | null
  rows: RenderedRow[]
  noResults: string | null
}

export function readRenderedPage(html: string): RenderedPage {
  const sections = [...html.matchAll(/data-section="([^"]+)"/g)].map(match => match[1])
  const refinement = html.match(/data-section="readingRefinement"[\s\S]*?<\/p>/)
  // The kanji, then its label and meaning (the row's content).
  const kanji = html.match(
    /<span lang="ja" class="[^"]*text-4xl[^"]*">([^<]+)<\/span>[\s\S]*?data-kanji-row="[^"]*"[^>]*>([\s\S]*?)<\/div>/
  )
  const rows = segments(html, /data-result-row="(\d+)"/g).map(({ value, html: row }) => {
    const headword = row.match(/<span lang="ja"[^>]*>([\s\S]*?)<\/span>\s*<p/)?.[1] ?? ''
    const summary = row.match(/<p class="line-clamp-2[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? ''
    const shown = row.replace(srOnly, '')
    const chips = segments(shown, /data-chip="([^"]+)"/g).map(chip =>
      visibleText(`<x ${chip.html.split('</span></span>')[0]}`)
    )
    return {
      entSeq: Number(value),
      headword: visibleText(headword),
      summary: visibleText(summary),
      chips
    }
  })
  const empty = html.match(/data-slot="empty"[^>]*>([\s\S]*)$/)
  return {
    sections,
    refinement: refinement ? visibleText(`<x ${refinement[0]}`) : null,
    kanji: kanji ? { character: visibleText(kanji[1]), text: visibleText(kanji[2]) } : null,
    rows,
    noResults: empty && rows.length === 0 ? visibleText(empty[1]) : null
  }
}
