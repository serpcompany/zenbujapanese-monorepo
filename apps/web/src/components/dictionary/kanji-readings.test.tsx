import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { KanjiDetailsData } from '@/lib/dictionary/kanji-details'
import { visibleText } from '@/test/rendered'
import { KanjiReadings } from './kanji-readings'

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

const labels = { on: 'On', kun: 'Kun', name: 'Name' } as const

const pathFor = (word: SuiteWord) => `/dictionary/word-${word.id}/`

function readings(kanji: KanjiCase): KanjiDetailsData['readings'] {
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
  href: string | null
  label: string | null
  text: string
}

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
      label: attributes.match(/aria-label="([^"]+)"/)?.[1]?.replace(/&#x27;/g, "'") ?? null,
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
        href: first ? pathFor(first) : null,
        label: first
          ? `${label} reading ${reading.value}, ${first.headword}, ${first.summary}`
          : null,
        text: [
          label,
          reading.value,
          ...reading.words.map(word => `${word.headword} · ${word.summary}`)
        ]
          .join(' ')
          .replace(/\s+/g, ' ')
      }
    })
    expect(renderedRows(html)).toEqual(expected)
  })
})
