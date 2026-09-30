import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { KanjiPageData } from '@/lib/dictionary/data'
import { KanjiReadings } from './kanji-readings'
import { visibleText } from './rendered'

// Draws every case of the app-recorded kanji-detail suite's Readings through the kanji page's
// component and reads each row back from the server-rendered HTML: a row with words opens its
// first word, as KanjiReadingsSection's NavigationLink does, with the app's accessibility label,
// and a row without words opens nothing. The dictionary gate's conformance test
// (detail/conformance.test.ts) checks the page's readings and their words are the suite's, so
// together they hold the page's rows to the app's. The suite is read from the repository, with no
// database, so this runs with `pnpm test`; each word's path stands in for its page by the app's
// Language Reference ID.

interface SuiteWord {
  headword: string
  id: string
  reading: string
  summary: string
}

interface KanjiCase {
  character: string
  readings?: { kind: 'on' | 'kun' | 'name'; value: string; words: SuiteWord[] }[]
}

const suite: { cases: KanjiCase[] } = JSON.parse(
  readFileSync(
    new URL('../../../../ios/LanguageData/Conformance/kanji-detail.json', import.meta.url),
    'utf8'
  )
)

/** `KanjiReading.Kind.label` in KanjiDetailView.swift. */
const labels = { on: 'On', kun: 'Kun', name: 'Name' } as const

const pathFor = (word: SuiteWord) => `/dictionary/word-${word.id}/`

function readings(kanji: KanjiCase): KanjiPageData['readings'] {
  return (kanji.readings ?? []).map(reading => ({
    kind: reading.kind,
    label: labels[reading.kind],
    value: reading.value,
    words: reading.words.map((word, index) => ({
      entSeq: index,
      headword: word.headword,
      reading: word.reading,
      ruby: [],
      summary: word.summary,
      path: pathFor(word)
    }))
  }))
}

interface RenderedRow {
  row: string
  /** Where the row leads, or null when it isn't a link. */
  href: string | null
  label: string | null
  text: string
}

/** Each reading row as a reader meets it: its target, its spoken label, and its visible text. */
function renderedRows(html: string): RenderedRow[] {
  const opening = /<(a|div) ([^>]*data-kanji-reading="([^"]+)"[^>]*)>/g
  const matches = [...html.matchAll(opening)]
  return matches.map((match, index) => {
    const [, tag, attributes, row] = match
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? html.length
    return {
      row,
      href: tag === 'a' ? (attributes.match(/href="([^"]+)"/)?.[1] ?? '') : null,
      label: attributes.match(/aria-label="([^"]+)"/)?.[1] ?? null,
      // Each cell and word is a span; it ends a piece of text, as the app's separate Texts do.
      text: visibleText(html.slice(start, end).replaceAll('</span>', '</span> '))
    }
  })
}

const withReadings = suite.cases.filter(kanji => (kanji.readings ?? []).length > 0)

describe('the rendered kanji Readings rows match the app', () => {
  test('the suite has rows with and without words', () => {
    const rows = withReadings.flatMap(kanji => kanji.readings ?? [])
    expect(rows.some(reading => reading.words.length > 0)).toBe(true)
    expect(rows.some(reading => reading.words.length === 0)).toBe(true)
  })

  test.each(withReadings.map(kanji => [kanji.character, kanji] as const))('%s', (_, kanji) => {
    const html = renderToStaticMarkup(<KanjiReadings readings={readings(kanji)} />)
    const expected: RenderedRow[] = (kanji.readings ?? []).map(reading => {
      const first = reading.words[0]
      const label = labels[reading.kind]
      return {
        row: `${reading.kind}.${reading.value}`,
        // KanjiReadingsSection: `NavigationLink(value: .word(matches.first))`, or no link.
        href: first ? pathFor(first) : null,
        label: first
          ? `${label} reading ${reading.value}, ${first.headword}, ${first.summary}`
          : null,
        // KanjiReadingRow: the kind, the reading, then each word as "headword · summary".
        text: [
          label,
          reading.value,
          ...reading.words.map(word => `${word.headword} · ${word.summary}`)
        ]
          .join(' ')
          .replace(/\s+/g, ' ')
      }
    })
    expect(
      renderedRows(html).map(row => ({ ...row, label: row.label?.replace(/&#x27;/g, "'") ?? null }))
    ).toEqual(expected)
  })
})
