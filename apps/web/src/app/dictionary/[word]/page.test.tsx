import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { visibleText } from '@/test/rendered'
import WordPage from './page'

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env: {} }) }))

async function renderWord(word: string) {
  const page = await WordPage({
    params: Promise.resolve({ word }),
    searchParams: Promise.resolve({})
  })
  return renderToStaticMarkup(page)
}

const credited = (html: string) =>
  [...html.matchAll(/<li><a href="[^"]*" class="underline[^"]*">([^<]+)<\/a>/g)].map(
    ([, name]) => name
  )

describe('the word page, read from the fixtures', () => {
  test('a kanji the dictionary has details for opens to them; one without is a plain row', async () => {
    const html = await renderWord('要項-1546750')
    const kaname = html.match(/data-kanji-row="要"><button([^>]*)>/)?.[1] ?? ''
    expect(kaname).toContain('aria-expanded="false"')
    expect(kaname).toMatch(/aria-label="要, [^"]+, shows kanji details"/)
    const panel = kaname.match(/aria-controls="([^"]+)"/)?.[1]
    const details = html.slice(html.indexOf(`<div id="${panel}" hidden="">`))
    expect(details).toMatch(/^<div id="[^"]+" hidden=""><div[^>]*><div[^>]*data-kanji-details="要"/)
    expect(visibleText(details)).toContain('need, main point, essence, pivot, key to')
    expect(html).toMatch(/<div class="[^"]*" data-kanji-row="項"><span lang="ja"/)
    expect(html).not.toContain('data-kanji-details="項"')
  })

  test('credits the kanji data its details show', async () => {
    expect(credited(await renderWord('要項-1546750'))).toEqual([
      'JMdict',
      'UniDic',
      'KANJIDIC2',
      'JLPT levels',
      'TUBELEX',
      'Tatoeba',
      'RADKFILE',
      'KanjiVG',
      'Kanjium'
    ])
    expect(credited(await renderWord('いる-1577980'))).toEqual([
      'JMdict',
      'UniDic',
      'KANJIDIC2',
      'JLPT levels',
      'TUBELEX',
      'Tatoeba'
    ])
  })

  test('keeps its Sources closed, with every credit in the HTML', async () => {
    const html = await renderWord('いる-1577980')
    const sources = html.slice(html.indexOf('<footer'))
    expect(sources).toMatch(/^<footer[^>]*><details class="group"><summary[^>]*>Sources<svg/)
    expect(credited(sources)).toContain('Tatoeba')
  })

  test('a verb has a closed Conjugations section, which its part of speech links to', async () => {
    const html = await renderWord('要る-1546640')
    expect(html).toMatch(/<a href="#conjugations" data-opens-conjugations="true"/)
    expect(html).toMatch(
      /<div[^>]* id="conjugations"[^>]*><div[^>]*><h2[^>]*><button[^>]*aria-expanded="false"/
    )
    expect(html).toMatch(/<ul class="[^"]*" data-conjugation-rows="Plain">/)
    expect(html).toMatch(/<ul hidden="" class="[^"]*" data-conjugation-rows="Polite">/)
    expect(html).toContain('aria-label="Past, 要った, いった"')
  })

  test('a noun has no Conjugations section', async () => {
    const html = await renderWord('要-1609600')
    expect(html).not.toContain('id="conjugations"')
    expect(html).not.toContain('data-opens-conjugations')
  })

  test('the Examples section sits at #examples, where search results send their sentences', async () => {
    const html = await renderWord('要る-1546640')
    expect(html).toMatch(/<div[^>]* id="examples"[^>]*><div[^>]*><div[^>]*>Examples<\/div>/)
  })
})
