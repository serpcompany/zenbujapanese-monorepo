import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { furiganaPageIn, questionsIn } from '@/lib/tools/tool-pages'
import { FuriganaPage } from './furigana-page'

const html = (locale: Locale = 'en') =>
  renderToStaticMarkup(<FuriganaPage page={furiganaPageIn(locale)} locale={locale} />)

const rubyPairs = (page: string) =>
  [...page.matchAll(/<ruby>([^<]*)<rt[^>]*>([^<]*)<\/rt><\/ruby>/g)].map(
    ([, base, reading]) => `${base}:${reading}`
  )

const faqNames = (page: string) => {
  const json = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
  const data = json ? JSON.parse(json) : null
  return data?.['@type'] === 'FAQPage'
    ? (data.mainEntity as { name: string }[]).map(({ name }) => name)
    : []
}

describe('the Kanji to Furigana page’s HTML', () => {
  test('holds the sample with its furigana, so it reads before any script runs', () => {
    expect(rubyPairs(html())).toEqual([
      '今日:きょう',
      '大人:おとな',
      '子供:こども',
      '日本:にほん',
      '映画:えいが',
      '見:み',
      '行:い'
    ])
  })

  test('has How it works, its three questions with their FAQ data, related tools, and no kana chart', () => {
    const page = html()
    for (const { question, answer } of questionsIn('furigana', 'en')) {
      expect(page).toContain(question)
      expect(page).toContain(answer)
    }
    expect(faqNames(page)).toEqual(questionsIn('furigana', 'en').map(({ question }) => question))
    expect(page).toContain('How it works')
    for (const slug of furiganaPageIn('en').related)
      expect(page).toContain(`href="/tools/${slug}/"`)
    expect(page).toMatch(/<a [^>]*href="\/tools\/"[^>]*>All tools/)
    expect(page).not.toContain('role="tablist"')
  })

  test('a Japanese page is in Japanese, with its links under /ja/', () => {
    const page = html('ja')
    const text = getDictionary('ja').tools
    expect(page).toContain(furiganaPageIn('ja').name)
    expect(page).toContain(text.furigana.heading)
    expect(faqNames(page)).toEqual(questionsIn('furigana', 'ja').map(({ question }) => question))
    const links = [...page.matchAll(/href="(\/[^"]*)"/g)].map(([, href]) => href)
    expect(links.filter(href => !href.startsWith('/ja/'))).toEqual([])
  })
})
