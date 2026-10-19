import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { type AppArea, appAreasIn } from '@/lib/app-areas'
import { appVideos } from '@/lib/videos'
import { sampleVideo } from '@/test/sample-video'
import { HomeAreas } from './home-areas'

const playerMedia = (areas: readonly AppArea[]) =>
  areas.find(area => area.id === 'player')?.media.map(item => item.kind)

test('there are no videos yet, so the Player area shows only its drawn preview', () => {
  expect(appVideos).toEqual([])
  expect(playerMedia(appAreasIn('en'))).toEqual(['drawn'])
  expect(renderToStaticMarkup(<HomeAreas locale="en" />)).not.toContain('aria-label="Play ')
})

test('with videos, the Player area adds each one, and nothing loads from YouTube before a click', () => {
  const areas = appAreasIn('en', [sampleVideo])
  expect(playerMedia(areas)).toEqual(['drawn', 'video'])
  const html = renderToStaticMarkup(<HomeAreas locale="en" areas={areas} />)
  expect(html).toContain('aria-label="Play A sample video"')
  expect(html).toContain('aria-label="A sample video, 2 of 2"')
  expect(html).not.toMatch(/youtube|ytimg|<iframe/)
})

test('in Japanese, the areas are in Japanese and the drawings of the English app say so', () => {
  const html = renderToStaticMarkup(<HomeAreas locale="ja" />)
  expect(html).toContain('読む・観る・話すを、ひとつのアプリで')
  for (const area of appAreasIn('ja')) expect(html).toContain(`>${area.name}</button>`)
  expect(html).toContain('aria-label="検索結果（5枚中1枚目）"')
  expect(html).toContain('aria-label="次の画面"')
  expect(html).toContain('alt="アプリの「大丈夫」の単語ページ。')
  expect(html.match(/data-drawing="true" lang="en"/g)).toHaveLength(3)
  expect(html).not.toContain('Every word, fully explained')
  expect(renderToStaticMarkup(<HomeAreas locale="en" />)).not.toContain('lang="en"')
})
