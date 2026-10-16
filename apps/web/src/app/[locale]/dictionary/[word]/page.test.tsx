import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { getWordPage } from '@/lib/dictionary/data'
import { pageProps } from '@/test/page-props'
import { Redirect } from '@/test/redirect'
import { visibleText } from '@/test/rendered'
import WordPage, { generateMetadata } from './page'

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env: {} }) }))
vi.mock('next/navigation', async original =>
  (await import('@/test/redirect')).redirectingNavigation(original)
)

const props = (word: string, locale = 'en') => pageProps({ locale, word })

async function renderWord(word: string, locale = 'en') {
  return renderToStaticMarkup(await WordPage(props(word, locale)))
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

  test('a Japanese word page reads in Japanese, links within /ja/, and keeps JMdict in English', async () => {
    const html = await renderWord('要る-1546640', 'ja')
    const titles = [
      ...html.matchAll(/data-slot="card-title"[^>]*>([^<]+)<|<h2[^>]*><button[^>]*>([^<]+)</g)
    ].map(([, card, disclosure]) => card ?? disclosure)
    expect(titles.slice(0, 7)).toEqual([
      '英語の意味',
      '使用頻度',
      '活用',
      '漢字',
      'リスト',
      'メモ',
      '例文'
    ])
    expect(html).toContain('<span>五段動詞（自動詞）</span>')
    expect(html).toContain('lang="en">to be needed, to be necessary')
    expect(html).toContain('通常はかな書き')
    expect(html).toMatch(/<summary[^>]*>出典<svg/)
    expect(html).toContain('href="/ja/dictionary/"')
    expect(html).not.toMatch(/href="\/dictionary\/(?!examples\/|conjugations\/)/)
  })

  test('a Japanese word page is titled for its English, its meaning, and its examples', async () => {
    const metadata = await generateMetadata(props('要る-1546640', 'ja'))
    expect(metadata.title).toBe('要る（いる）の英語・意味・例文')
    expect(metadata.description).toBe(
      '「要る（いる）」は英語で「to be needed, to be necessary, to be required, to be wanted, to need, to want」という意味です。品詞は五段動詞（自動詞）。'
    )
    expect(metadata.alternates?.canonical).toBe(`/ja${encodeURI('/dictionary/要る-1546640/')}`)
    expect((await generateMetadata(props('要る-1546640'))).title).toBe('要る (いる) meaning')
  })

  test('a word under an old slug redirects to its current one in the same language', async () => {
    const redirect = (locale: string) =>
      WordPage(props('old-1546640', locale)).then(
        () => null,
        (error: unknown) => (error instanceof Redirect ? error.path : null)
      )
    expect(await redirect('en')).toBe(encodeURI('/dictionary/要る-1546640/'))
    expect(await redirect('ja')).toBe(encodeURI('/ja/dictionary/要る-1546640/'))
  })

  test('the Examples section sits at #examples, where search results send their sentences', async () => {
    const html = await renderWord('要る-1546640')
    expect(html).toMatch(/<div[^>]* id="examples"[^>]*><div[^>]*><div[^>]*>Examples<\/div>/)
  })
})
