// Reads what a rendered search results page or Example Sentences page shows, from its
// server-rendered HTML, for the rendered-page tests (search-results.test.tsx and
// search-examples.test.tsx): the sections in order, the Example Sentences row, the kanji row, and
// each word row's headword, meaning, and chips; and each example's words, links, marked words,
// furigana, translation, and credit, as a reader sees them. Test-only.

import { type ReadingAidSettings, readingAidDefaults } from '@/lib/dictionary/detail/reading-aids'

/**
 * The HTML as a reader sees it under Reading Aids `settings`: each aid's text that its setting
 * hides is removed (reading-aid.tsx marks each with `data-reading-aid` and the class that hides it;
 * reading-aids.test.tsx checks the two agree). Aid text is plain text, except furigana, whose
 * `<rt>` can hold a span per kanji.
 */
export function asShown(html: string, settings: ReadingAidSettings = readingAidDefaults): string {
  const remove = (kind: string, tag = 'span') =>
    new RegExp(`<${tag} data-reading-aid="${kind}"[^>]*>[\\s\\S]*?</${tag}>`, 'g')
  let shown = html
  if (!settings.romaji) shown = shown.replace(remove('romaji'), '')
  if (!settings.wordMeanings) shown = shown.replace(remove('wordMeaning'), '')
  if (!settings.translations) shown = shown.replace(remove('translation', 'p'), '')
  shown = settings.furigana
    ? shown.replace(remove('readingWithoutFurigana'), '')
    : shown.replace(remove('furigana', 'rt'), '')
  return shown
}

/** Text only screen readers get, such as a chip's spoken tier. */
const srOnly = /<span class="sr-only">[\s\S]*?<\/span>/g

/** Applies `pattern` until nothing changes, so a removal can't leave a new match behind. */
function removeAll(text: string, pattern: RegExp, replacement = ''): string {
  let previous: string
  let current = text
  do {
    previous = current
    current = current.replace(pattern, replacement)
  } while (current !== previous)
  return current
}

/** The HTML without text only screen readers get, removed until none remains. */
export function withoutScreenReaderText(html: string): string {
  return removeAll(html, srOnly)
}

/** Furigana: a `<ruby>`'s reading. */
const furiganaTag = /<rt\b[^>]*>[\s\S]*?<\/rt>/g

/**
 * The one text extractor every rendered-page reader uses: tags removed until none remain, so a
 * removal can't leave a new tag behind (`<scr<script>ipt>`), then any `<` an unfinished tag left,
 * and quotes and ampersands decoded. `&lt;` and `&gt;` stay encoded, so the result never holds a
 * `<`; React encodes every one in text, so no suite text loses one. Furigana is left out unless
 * `furigana` keeps it. Whitespace is kept as written.
 */
export function htmlText(html: string, { furigana = false }: { furigana?: boolean } = {}): string {
  const text = furigana ? html : removeAll(html, furiganaTag)
  return removeAll(text, /<[^>]*>/g)
    .replace(/</g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;(?!lt;|gt;)/g, '&')
}

/**
 * Visible text: furigana (`<rt>`) and screen-reader-only text left out, tags removed, quotes and
 * ampersands decoded (`htmlText`), and whitespace collapsed.
 */
export function visibleText(html: string): string {
  let text = removeAll(html, furiganaTag)
  text = removeAll(text, srOnly)
  // A block ends a line.
  text = removeAll(text, /<\/(?:p|div|h\d)>/g, ' ')
  return htmlText(text).replace(/\s+/g, ' ').trim()
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
  /** The Example Sentences row's text and where it goes. */
  examples: { text: string; href: string | null } | null
  refinement: string | null
  kanji: { character: string; text: string } | null
  rows: RenderedRow[]
  noResults: string | null
}

export function readRenderedPage(shownHtml: string): RenderedPage {
  const html = asShown(shownHtml)
  const sections = [...html.matchAll(/data-section="([^"]+)"/g)].map(match => match[1])
  const refinement = html.match(/data-section="readingRefinement"[\s\S]*?<\/p>/)
  const examples = html.match(/data-section="examples"[\s\S]*?<\/p>/)
  // The kanji, then its label and meaning (the row's content).
  const kanji = html.match(
    /<span lang="ja" class="[^"]*text-4xl[^"]*">([^<]+)<\/span>[\s\S]*?data-kanji-row="[^"]*"[^>]*>([\s\S]*?)<\/div>/
  )
  const rows = segments(html, /data-result-row="(\d+)"/g).map(({ value, html: row }) => {
    const headword = row.match(/<span lang="ja"[^>]*>([\s\S]*?)<\/span>\s*<p/)?.[1] ?? ''
    const summary = row.match(/<p class="line-clamp-2[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? ''
    const shown = withoutScreenReaderText(row)
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
    examples: examples
      ? {
          text: visibleText(`<x ${examples[0]}`),
          href: examples[0].match(/href="([^"]*)"/)?.[1] ?? null
        }
      : null,
    refinement: refinement ? visibleText(`<x ${refinement[0]}`) : null,
    kanji: kanji ? { character: visibleText(kanji[1]), text: visibleText(kanji[2]) } : null,
    rows,
    noResults: empty && rows.length === 0 ? visibleText(empty[1]) : null
  }
}

/** The top-level elements of an HTML fragment, each whole. */
function topLevelElements(html: string): string[] {
  const elements: string[] = []
  let depth = 0
  let start = 0
  for (const tag of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/g)) {
    if (tag[3] === '/') continue
    if (tag[1] === '/') {
      depth -= 1
      if (depth === 0) elements.push(html.slice(start, tag.index + tag[0].length))
    } else {
      if (depth === 0) start = tag.index
      depth += 1
    }
  }
  return elements
}

export interface RenderedExampleWord {
  text: string
  /** Furigana, as `base(reading)` for each annotated part; empty without any. */
  furigana: string
  href: string | null
  /** Marked as the page's word, or the query's. */
  marked: boolean
}

export interface RenderedExample {
  position: number
  words: RenderedExampleWord[]
  translation: string
  credit: string
}

/** Each example's words, translation, and credit, in document order. */
export function readRenderedExamples(shownHtml: string): RenderedExample[] {
  const html = asShown(shownHtml)
  return segments(html, /data-example="(\d+)"/g).map(({ value, html: item }) => {
    const japanese = item.match(/<p lang="ja"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''
    const words = topLevelElements(japanese).map(element => ({
      text: visibleText(element),
      furigana: [...element.matchAll(/<ruby>([^<]*)<rt[^>]*>([^<]*)<\/rt><\/ruby>/g)]
        .map(ruby => `${ruby[1]}(${ruby[2]})`)
        .join(''),
      href: element.startsWith('<a ') ? (element.match(/href="([^"]*)"/)?.[1] ?? null) : null,
      marked: /class="[^"]*border-b-2/.test(element)
    }))
    const translation =
      item.match(/<p data-reading-aid="translation"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''
    const credit = item.match(/<p class="text-xs text-muted-foreground">([\s\S]*?)<\/p>/)?.[1] ?? ''
    return {
      position: Number(value),
      words,
      translation: visibleText(translation),
      credit: visibleText(credit)
    }
  })
}
