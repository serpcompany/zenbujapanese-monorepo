import { browseCategory } from '@zenbu/dictionary-core/browse/categories'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { dictionaryTreeIn, homeTreeIn } from '@/lib/dictionary/browse/site-tree'
import type { Locale } from '@/lib/i18n/config'
import { visibleText } from '@/test/rendered'
import { SiteTree } from '../../site-tree'
import { Pagination } from './browse-ui'
import { CategoryIndexPage, CategoryWords } from './category-pages'

const godanVerbs = browseCategory('godan-verbs')
if (!godanVerbs) throw new Error('The core lists no godan verbs')

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(([, href]) => href)

const indexPage = (locale: Locale) =>
  renderToStaticMarkup(
    <CategoryIndexPage
      index="partOfSpeech"
      groups={[{ title: null, categories: [{ category: godanVerbs, count: 1_234 }] }]}
      locale={locale}
    />
  )

const wordsPage = (locale: Locale) =>
  renderToStaticMarkup(
    <CategoryWords
      category={godanVerbs}
      words={{ total: 401, page: 2, pages: 3, words: [] }}
      order="used"
      page={2}
      locale={locale}
    />
  )

describe('a category index', () => {
  test('in English, names the index and links its categories at their English paths', () => {
    const html = indexPage('en')
    expect(html).toMatch(/<h1 [^>]*>Parts of speech<\/h1>/)
    expect(visibleText(html)).toMatch(/Godan verbs\s*1,234/)
    expect(hrefs(html)).toContain('/dictionary/browse/godan-verbs/')
  })

  test('in Japanese, names it in Japanese and links under /ja/', () => {
    const html = indexPage('ja')
    expect(html).toMatch(/<h1 [^>]*>品詞一覧<\/h1>/)
    expect(visibleText(html)).toMatch(/五段動詞\s*1,234/)
    expect(hrefs(html)).toContain('/ja/dictionary/browse/godan-verbs/')
    expect(hrefs(html)).not.toContain('/dictionary/browse/godan-verbs/')
  })
})

describe('a category’s words', () => {
  test('in English, says which page this is after the intro, and its tabs keep English paths', () => {
    const text = visibleText(wordsPage('en'))
    expect(text).toContain('Japanese godan verbs')
    expect(text).toMatch(
      /401 words JMdict lists as godan verbs, most used on YouTube first, .+ Page 2 of 3\./
    )
    expect(hrefs(wordsPage('en'))).toContain('/dictionary/browse/godan-verbs/kana-order/')
  })

  test('in Japanese, writes the heading, intro, and page in Japanese, with every link under /ja/', () => {
    const html = wordsPage('ja')
    const text = visibleText(html)
    expect(text).toContain('五段動詞一覧')
    expect(text).toMatch(
      /JMdictで品詞が五段動詞とされている言葉401語です。.+3ページ中2ページ目です。/
    )
    expect(text).toContain('五十音順')
    const internal = hrefs(html).filter(href => href.startsWith('/'))
    expect(internal.length).toBeGreaterThan(0)
    expect(internal.filter(href => !href.startsWith('/ja/'))).toEqual([])
  })
})

describe('pagination', () => {
  const pages = (locale: Locale) =>
    renderToStaticMarkup(
      <Pagination page={2} pages={3} pathFor={page => `/x/${page}/`} locale={locale} />
    )

  test('labels its arrows in each language and localizes its links', () => {
    expect(pages('en')).toContain('aria-label="Pages"')
    expect(visibleText(pages('en'))).toMatch(/^← Previous.*Next →$/)
    expect(pages('ja')).toContain('aria-label="ページ"')
    expect(visibleText(pages('ja'))).toMatch(/^← 前へ.*次へ →$/)
    expect(hrefs(pages('ja'))).toEqual(['/ja/x/1/', '/ja/x/1/', '/ja/x/3/', '/ja/x/3/'])
  })
})

describe('the HTML sitemap', () => {
  const tree = (locale: Locale) =>
    renderToStaticMarkup(
      <SiteTree
        title="title"
        trees={[homeTreeIn(locale), dictionaryTreeIn(locale)]}
        locale={locale}
      />
    )

  test('lists the English pages at their own paths', () => {
    const html = tree('en')
    expect(hrefs(html)).toContain('/dictionary/browse/kanji/#by-stroke-count')
    expect(visibleText(html)).toContain('JLPT N5 vocabulary')
  })

  test('lists the Japanese pages, in Japanese, under /ja/', () => {
    const html = tree('ja')
    expect(hrefs(html).filter(href => !href.startsWith('/ja/'))).toEqual([])
    expect(hrefs(html)).toContain('/ja/dictionary/browse/kanji/#by-stroke-count')
    expect(visibleText(html)).toContain('JLPT N5の単語一覧')
    expect(visibleText(html)).toContain('五十音表')
  })
})
