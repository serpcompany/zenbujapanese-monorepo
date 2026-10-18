import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { iphoneAppPageIn } from '@/lib/products/zenbu-japanese-for-iphone'
import { linkTo } from '@/lib/site'
import { appVideos } from '@/lib/videos'
import { sampleVideo } from '@/test/sample-video'
import { ProductHero } from './product-hero'
import { ProductVideos } from './product-videos'

const hero = (hasVideos: boolean, locale: Locale = 'en') =>
  renderToStaticMarkup(
    <ProductHero
      product={iphoneAppPageIn(locale)}
      locale={locale}
      facts={null}
      hasVideos={hasVideos}
    />
  )

const videos = (shown: Parameters<typeof ProductVideos>[0]['videos'], locale: Locale = 'en') => {
  const text = getDictionary(locale).productPage
  return renderToStaticMarkup(
    <ProductVideos videos={shown} locale={locale} text={text.videos} carousel={text.carousel} />
  )
}

test('there are no videos yet, so the page has no video section and no Watch demo', () => {
  expect(appVideos).toEqual([])
  expect(videos(appVideos)).toBe('')
  expect(hero(false)).not.toContain('Watch demo')
})

test('with videos, Watch it work lists them and links to all videos, and Watch demo leads there', () => {
  const html = videos([sampleVideo])
  expect(html).toContain('<section id="watch-it-work"')
  expect(html).toContain('>Watch it work.</h2>')
  expect(html).toContain('aria-label="Play A sample video"')
  const allVideos = html.match(/<a data-link-target="videos"[^>]* href="([^"]*)">See all videos/)
  expect(allVideos?.[1]).toBe(linkTo('videos').href)
  expect(html).not.toMatch(/youtube|ytimg|<iframe|<script/)
  expect(hero(true)).toMatch(/<a href="#watch-it-work"[^>]*>.*Watch demo<\/a>/)
})

test('the Japanese hero and videos are in Japanese, and the breadcrumb leads to the Japanese catalog', () => {
  const html = hero(true, 'ja')
  expect(html).toContain('<h1')
  expect(html).toContain('iPhone向けの和英辞典・翻訳アプリ')
  expect(html).toContain('href="/ja/products/"')
  expect(html).toContain('>製品一覧</a>')
  expect(html).toContain('aria-label="パンくずリスト"')
  expect(html).toContain('aria-label="次の機能"')
  expect(html).toMatch(/<a href="#watch-it-work"[^>]*>.*デモを見る<\/a>/)
  const videoHtml = videos([sampleVideo], 'ja')
  expect(videoHtml).toContain('>動画で見る</h2>')
  expect(videoHtml).toContain('aria-label="A sample videoを再生"')
  expect(videoHtml).toContain('aria-label="1件中1件目"')
})
