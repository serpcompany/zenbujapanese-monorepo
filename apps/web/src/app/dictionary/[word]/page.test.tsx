import {
  dictionaryContract,
  dictionaryContractHeader
} from '@zenbu/dictionary-core/artifact/contract'
import { fixtureWordRows } from '@zenbu/dictionary-core/fixtures'
import { sourceCredits } from '@zenbu/dictionary-core/sources/credits'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { getWordPage } from '@/lib/dictionary/data'
import { kanjiSearchPath } from '@/lib/dictionary/urls'
import { listedWithLicence, pageSourcesList } from '@/test/credits'
import { htmlText, visibleText } from '@/test/rendered'
import WordPage from './page'

const serviceEnv: { DICTIONARY_API_URL?: string; DICTIONARY_API_TOKEN?: string } = {}
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: serviceEnv })
}))

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

const sectionHTML = (html: string, title: string) => {
  const start = html.search(new RegExp(`<div data-slot="card-title"[^>]*>${title}</div>`))
  const end = html.indexOf('data-slot="card"', start)
  return start === -1 ? '' : html.slice(start, end === -1 ? html.indexOf('<footer') : end)
}

const sentencesOf = (entSeq: number) =>
  new Map(
    fixtureWordRows
      .find(rows => rows.entry.entSeq === entSeq)
      ?.examples.map(({ sentence }) => [sentence.pairId, sentence])
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
      'JLPT vocabulary lists',
      'TUBELEX',
      'Tatoeba',
      'RADKFILE',
      'KanjiVG',
      'Kanjium',
      'JLPT kanji lists'
    ])
    expect(credited(await renderWord('いる-1577980'))).toEqual([
      'JMdict',
      'UniDic',
      'KANJIDIC2',
      'JLPT vocabulary lists',
      'TUBELEX',
      'Tatoeba'
    ])
  })

  test('credits JMdict, UniDic, KANJIDIC2, the JLPT lists, TUBELEX, and Tatoeba, each with its licence', async () => {
    const base = [
      sourceCredits.jmdict,
      sourceCredits.unidic,
      sourceCredits.kanjidic2,
      sourceCredits.jlpt,
      sourceCredits.tubelex,
      sourceCredits.tatoeba
    ]
    expect(pageSourcesList(await renderWord('いる-1577980'))).toEqual(base.map(listedWithLicence))
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

  test('its sections follow the core', async () => {
    const html = await renderWord('要る-1546640')
    const titles = [
      ...html.matchAll(/data-slot="card-title"[^>]*>([^<]+)<|<h2[^>]*><button[^>]*>([^<]+)</g)
    ].map(([, card, disclosure]) => card ?? disclosure)
    const sections = (await getWordPage(1546640))?.sections.map(section => section.title) ?? []
    expect(sections).toEqual([
      'Meaning',
      'Frequency',
      'Conjugations',
      'Kanji',
      'Lists',
      'Notes',
      'Examples'
    ])
    expect(titles.slice(0, sections.length)).toEqual(sections)
  })

  test('a written form with a kanji links to the search for its first kanji', async () => {
    const rows = fixtureWordRows.find(word => word.entry.entSeq === 1391500)
    const answer = { rows, slug: '炒る', slugs: {}, kanjiPages: ['煎', '熬'] }
    const headers = { [dictionaryContractHeader]: String(dictionaryContract) }
    vi.stubGlobal('fetch', async (request: Request) =>
      new URL(request.url).pathname === '/v1/words/1391500'
        ? Response.json(answer, { headers })
        : Response.json({ error: 'not found' }, { status: 404, headers })
    )
    Object.assign(serviceEnv, {
      DICTIONARY_API_URL: 'https://dictionary.test',
      DICTIONARY_API_TOKEN: 'test-token'
    })
    const alternatives = await renderWord('炒る-1391500')
      .then(html => sectionHTML(html, 'Alternatives'))
      .finally(() => {
        delete serviceEnv.DICTIONARY_API_URL
        delete serviceEnv.DICTIONARY_API_TOKEN
        vi.unstubAllGlobals()
      })
    const links = [...alternatives.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(
      ([, href, form]) => ({ href, form: htmlText(form) })
    )
    expect(links).toEqual([
      { href: kanjiSearchPath('煎'), form: '煎る' },
      { href: kanjiSearchPath('熬'), form: '熬る (Rare)' }
    ])
  })

  test('Lists and Notes each offer the action the app has, as a prompt', async () => {
    const html = await renderWord('要る-1546640')
    for (const [title, action] of [
      ['Lists', 'Add to List'],
      ['Notes', 'Add Note']
    ]) {
      const section = sectionHTML(html, title)
      expect(section, title).toMatch(new RegExp(`<button[^>]*>${action}</button>`))
      expect(visibleText(section), title).toMatch(new RegExp(`^${title} ${action} `))
    }
  })

  test('a word without examples says so, in place of a list', async () => {
    const examples = sectionHTML(await renderWord('要所-1612150'), 'Examples')
    expect(visibleText(examples)).toBe('Examples No source-matched examples')
    expect(examples).not.toContain('data-example')
  })

  test('shows the Reading Aids the app has on by default, and none of those it has off', async () => {
    const html = await renderWord('要る-1546640')
    expect(html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0]).toContain('data-reading="い"')
    const sentences = sentencesOf(1546640)
    const examples = [
      ...html.matchAll(/<li[^>]*data-example-pair="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)
    ].map(([, pairId, example]) => ({
      sentence: sentences.get(pairId),
      paragraphs: [...example.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(([, p]) => p)
    }))
    expect(examples).toHaveLength(25)
    for (const { sentence, paragraphs } of examples) {
      expect(paragraphs.map(paragraph => htmlText(paragraph))).toEqual([
        sentence?.japanese,
        sentence?.english
      ])
      const furigana = [...paragraphs[0].matchAll(/<rt[^>]*>([^<]*)<\/rt>/g)].map(
        ([, kana]) => kana
      )
      expect(furigana.filter(reading => !/^\p{scx=Hiragana}+$/u.test(reading))).toEqual([])
    }
    expect(examples.filter(({ paragraphs }) => paragraphs[0].includes('<rt'))).not.toHaveLength(0)
  })

  test('the Examples section sits at #examples, where search results send their sentences', async () => {
    const html = await renderWord('要る-1546640')
    expect(html).toMatch(/<div[^>]* id="examples"[^>]*><div[^>]*><div[^>]*>Examples<\/div>/)
  })
})
