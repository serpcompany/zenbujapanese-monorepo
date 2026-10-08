import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { questions } from '@/lib/tools/content'
import { converterFor, converters } from '@/lib/tools/converters'
import { ConverterPage } from './converter-page'

const page = (slug: (typeof converters)[number]['slug']) =>
  renderToStaticMarkup(<ConverterPage converter={converterFor(slug)} />)

const conversionTableRows = (html: string) =>
  [...html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)]
    .map(([, body]) => body.match(/<tr /g)?.length ?? 0)
    .reduce((total, rows) => total + rows, 0)

const tabPanels = (html: string) =>
  [...html.matchAll(/<div ([^>]*role="tabpanel"[^>]*)>/g)].map(([, attributes]) => ({
    label: attributes.match(/aria-labelledby="([^"]+)"/)?.[1],
    hidden: /\shidden=""/.test(` ${attributes}`)
  }))

function structuredData(html: string) {
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
  return json ? JSON.parse(json) : null
}

describe('a converter page’s HTML', () => {
  test.each(
    converters.filter(converter => converter.pair !== 'width').map(converter => converter.slug)
  )('%s holds every row of its conversion table, with no group hidden', slug => {
    const html = page(slug)
    expect(conversionTableRows(html)).toBe(131)
    expect(html).not.toMatch(/<section[^>]*hidden=""[^>]*>\s*<h3/)
  })

  test.each([
    'half-width-to-full-width',
    'full-width-to-half-width'
  ] as const)('%s holds every row of its conversion table, beside its width table', slug => {
    expect(conversionTableRows(page(slug))).toBe(131 + 7)
  })

  test('the kana pages hold all three kana charts, the ones not shown hidden', () => {
    const html = page('hiragana-to-katakana')
    for (const label of ['Basic kana', 'With marks kana', 'Combinations kana']) {
      expect(html).toContain(`aria-label="${label}"`)
    }
    expect(tabPanels(html).map(panel => panel.hidden)).toEqual([false, true, true])
    expect(html).toContain('きゃ')
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

  test('the page links its other direction once, and related tools to theirs', () => {
    const html = page('half-width-to-full-width')
    expect(html.match(/href="\/tools\/full-width-to-half-width\/"/g)).toHaveLength(1)
    expect(html).toContain('Full-width to Half-width')
    for (const slug of converterFor('half-width-to-full-width').related) {
      expect(html).toContain(`href="/tools/${slug}/"`)
    }
  })
})
