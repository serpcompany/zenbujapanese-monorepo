const screenReaderOnly = /<span class="sr-only">[\s\S]*?<\/span>/g

function removeUntilNoneRemain(text: string, pattern: RegExp, replacement = ''): string {
  let previous: string
  let current = text
  do {
    previous = current
    current = current.replace(pattern, replacement)
  } while (current !== previous)
  return current
}

export function withoutScreenReaderText(html: string): string {
  return removeUntilNoneRemain(html, screenReaderOnly)
}

const furiganaTag = /<rt\b[^>]*>[\s\S]*?<\/rt>/g

const blockEnd = /<\/(?:p|div|h\d)>/g

export function htmlText(html: string, { furigana = false }: { furigana?: boolean } = {}): string {
  const text = furigana ? html : removeUntilNoneRemain(html, furiganaTag)
  return removeUntilNoneRemain(text, /<[^>]*>/g)
    .replace(/</g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;(?!lt;|gt;)/g, '&')
}

export function visibleText(html: string): string {
  let text = removeUntilNoneRemain(html, furiganaTag)
  text = removeUntilNoneRemain(text, screenReaderOnly)
  text = removeUntilNoneRemain(text, blockEnd, ' ')
  return htmlText(text).replace(/\s+/g, ' ').trim()
}

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
  sections: string[]
  examples: { text: string; href: string | null } | null
  refinement: string | null
  kanji: { character: string; text: string } | null
  rows: RenderedRow[]
  noResults: string | null
}

export function readRenderedPage(html: string): RenderedPage {
  const sections = [...html.matchAll(/data-section="([^"]+)"/g)].map(match => match[1])
  const refinement = html.match(/data-section="readingRefinement"[\s\S]*?<\/p>/)
  const examples = html.match(/data-section="examples"[\s\S]*?<\/p>/)
  const kanji = html.match(
    /<span lang="ja" class="[^"]*text-4xl[^"]*">([^<]+)<\/span><span[^>]*data-kanji-row="[^"]*"[^>]*>([\s\S]*?)<\/span><\/span>/
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
    kanji: kanji
      ? {
          character: visibleText(kanji[1]),
          text: kanji[2].split('</span>').map(visibleText).filter(Boolean).join(' ')
        }
      : null,
    rows,
    noResults: empty && rows.length === 0 ? visibleText(empty[1]) : null
  }
}

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
  furigana: string
  href: string | null
  marked: boolean
}

export interface RenderedExample {
  position: number
  words: RenderedExampleWord[]
  translation: string
  credit: string
}

export function readRenderedExamples(html: string): RenderedExample[] {
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
    const translation = item.match(/<p class="text-muted-foreground">([\s\S]*?)<\/p>/)?.[1] ?? ''
    const credit = item.match(/<p class="text-xs text-muted-foreground">([\s\S]*?)<\/p>/)?.[1] ?? ''
    return {
      position: Number(value),
      words,
      translation: visibleText(translation),
      credit: visibleText(credit)
    }
  })
}
