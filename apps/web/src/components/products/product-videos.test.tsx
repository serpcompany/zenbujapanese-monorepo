import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { appScreenshots } from '@/lib/app-screenshots'
import { iphoneAppPage } from '@/lib/products/zenbu-japanese-for-iphone'
import { linkTo } from '@/lib/site'
import { type AppVideo, appVideos } from '@/lib/videos'
import { ProductHero } from './product-hero'
import { ProductVideos } from './product-videos'

const sample: AppVideo = {
  youtubeId: 'not-a-real-video-id',
  title: 'A sample video',
  thumbnail: appScreenshots.handwriting
}

const hero = (hasVideos: boolean) =>
  renderToStaticMarkup(<ProductHero product={iphoneAppPage} facts={null} hasVideos={hasVideos} />)

test('there are no videos yet, so the page has no video section and no Watch demo', () => {
  expect(appVideos).toEqual([])
  expect(renderToStaticMarkup(<ProductVideos videos={appVideos} />)).toBe('')
  expect(hero(false)).not.toContain('Watch demo')
})

test('with videos, Watch it work lists them and links to all videos, and Watch demo leads there', () => {
  const html = renderToStaticMarkup(<ProductVideos videos={[sample]} />)
  expect(html).toContain('<section id="watch-it-work"')
  expect(html).toContain('>Watch it work.</h2>')
  expect(html).toContain('aria-label="Play A sample video"')
  expect(html).toMatch(
    new RegExp(`<a data-link-target="videos"[^>]* href="${linkTo('videos').href}">See all videos`)
  )
  expect(html).not.toMatch(/youtube|ytimg|<iframe|<script/)
  expect(hero(true)).toMatch(/<a href="#watch-it-work"[^>]*>.*Watch demo<\/a>/)
})
