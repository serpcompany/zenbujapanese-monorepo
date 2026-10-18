import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { questions, spellingRules, typingTips, widthRows } from '@/lib/tools/content'
import { converterFor, converters } from '@/lib/tools/converters'
import { ConverterPage } from './converter-page'

const page = (slug: (typeof converters)[number]['slug']) =>
  renderToStaticMarkup(<ConverterPage converter={converterFor(slug)} />)

const kanaInTheChart = (html: string) =>
  [...html.matchAll(/<ul aria-label="[^"]*" lang="ja"[^>]*>([\s\S]*?)<\/ul>/g)]
    .map(([, list]) => list.match(/<li>/g)?.length ?? 0)
    .reduce((total, tiles) => total + tiles, 0)

const tableRows = (html: string) =>
  [...html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)]
    .map(([, body]) => body.match(/<tr /g)?.length ?? 0)
    .reduce((total, rows) => total + rows, 0)

const hiddenPanels = (html: string) =>
  [...html.matchAll(/<div ([^>]*role="tabpanel"[^>]*)>/g)].map(([, attributes]) =>
    /\shidden=""/.test(` ${attributes}`)
  )

function structuredData(html: string) {
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
  return json ? JSON.parse(json) : null
}

const referenceRows: Record<(typeof converters)[number]['pair'], (slug: string) => number> = {
  kana: () => 0,
  romaji: slug => (slug === 'romaji-to-kana' ? typingTips.length : spellingRules.length),
  width: () => widthRows.length
}

describe('a converter page’s HTML', () => {
  test.each(
    converters.map(converter => converter.slug)
  )('%s holds every kana of its conversion chart in three tabs, the ones not shown hidden', slug => {
    const html = page(slug)
    const { pair } = converterFor(slug)
    expect(kanaInTheChart(html)).toBe(131)
    expect(tableRows(html)).toBe(referenceRows[pair](slug))
    expect(hiddenPanels(html)).toEqual([false, true, true])
  })

  test('the questions are in the page with their answers, and as FAQ structured data', () => {
    const html = page('romaji-to-kana')
    for (const { question, answer } of questions.romaji) {
      expect(html).toContain(question)
      expect(html).toContain(answer)
    }
    expect(structuredData(html)).toMatchObject({
      '@type': 'FAQPage',
      mainEntity: questions.romaji.map(({ question }) => ({ '@type': 'Question', name: question }))
    })
  })

  test('the romaji pages add their typing tips or spelling rules, and the width pages their table', () => {
    expect(page('romaji-to-kana')).toContain('Typing tips')
    expect(page('kana-to-romaji')).toContain('Spelling rules')
    expect(page('full-width-to-half-width')).toContain('What changes')
  })

  test('the page links its other direction once, related tools to theirs, and all the tools', () => {
    const html = page('half-width-to-full-width')
    expect(html.match(/href="\/tools\/full-width-to-half-width\/"/g)).toHaveLength(1)
    expect(html).toContain('Full-width to Half-width')
    for (const slug of converterFor('half-width-to-full-width').related) {
      expect(html).toContain(`href="/tools/${slug}/"`)
    }
    expect(html).toMatch(/<a [^>]*href="\/tools\/"[^>]*>All tools/)
  })
})
