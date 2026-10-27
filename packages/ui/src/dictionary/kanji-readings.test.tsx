import { readFileSync } from 'node:fs'
import { type KanjiReading, kanjiReadingText } from '@zenbu/dictionary-core/detail/kanji'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { KanjiReadings } from './kanji-readings'
import type { RenderWordLink } from './word-link'

interface SuiteWord {
  headword: string
  id: string
  reading: string
  summary: string
}

interface KanjiCase {
  character: string
  readings?: {
    kind: 'on' | 'kun' | 'name'
    value: string
    spoken?: string
    words: SuiteWord[]
  }[]
}

const suite: { cases: KanjiCase[] } = JSON.parse(
  readFileSync(
    new URL('../../../../language-data/conformance/kanji-detail.json', import.meta.url),
    'utf8'
  )
)

const labels = { on: 'On', kun: 'Kun', name: 'Name' } as const

const wordPath = (entSeq: number) => `/dictionary/word-${entSeq}/`

const renderWordLink: RenderWordLink = ({ target, ...props }) =>
  'entSeq' in target ? <a href={wordPath(target.entSeq)} {...props} /> : null

function readings(kanji: KanjiCase): KanjiReading[] {
  return (kanji.readings ?? []).map(reading => ({
    kind: reading.kind,
    label: labels[reading.kind],
    value: reading.value,
    ...kanjiReadingText(labels[reading.kind], reading.value, reading.words),
    words: reading.words.map((word, index) => ({
      id: word.id,
      entSeq: index,
      headword: word.headword,
      reading: word.reading,
      ruby: [],
      summary: word.summary
    }))
  }))
}

function shownText(html: string): string {
  return html
    .replace(/<span\b[^>]*\bdata-aid="romaji"[^>]*>[^<]*<\/span>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
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
      text: shownText(html.slice(start, end).replaceAll('</span>', '</span> '))
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
    const html = renderToStaticMarkup(
      <KanjiReadings readings={readings(kanji)} renderWordLink={renderWordLink} />
    )
    const expected: RenderedRow[] = (kanji.readings ?? []).map(reading => ({
      row: `${reading.kind}.${reading.value}`,
      href: reading.words.length > 0 ? wordPath(0) : null,
      label: reading.spoken ?? null,
      text: [
        labels[reading.kind],
        reading.value,
        ...reading.words.map(word => `${word.headword} · ${word.summary}`)
      ]
        .join(' ')
        .replace(/\s+/g, ' ')
    }))
    expect(renderedRows(html)).toEqual(expected)
  })

  test('a row whose client gives no link stays a plain row', () => {
    const [kanji] = withReadings.filter(item =>
      (item.readings ?? []).some(reading => reading.words.length > 0)
    )
    const html = renderToStaticMarkup(
      <KanjiReadings readings={readings(kanji)} renderWordLink={() => null} />
    )
    expect(renderedRows(html).map(row => row.href)).toEqual((kanji.readings ?? []).map(() => null))
  })
})
