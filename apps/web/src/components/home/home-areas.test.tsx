import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { appAreas, appAreasWith } from '@/lib/app-areas'
import { appVideos } from '@/lib/videos'
import { sampleVideo } from '@/test/sample-video'
import { HomeAreas } from './home-areas'

const playerMedia = (areas: typeof appAreas) =>
  areas.find(area => area.id === 'player')?.media.map(item => item.kind)

test('there are no videos yet, so the Player area shows only its drawn preview', () => {
  expect(appVideos).toEqual([])
  expect(playerMedia(appAreas)).toEqual(['drawn'])
  expect(renderToStaticMarkup(<HomeAreas />)).not.toContain('aria-label="Play ')
})

test('with videos, the Player area adds each one, and nothing loads from YouTube before a click', () => {
  const areas = appAreasWith([sampleVideo])
  expect(playerMedia(areas)).toEqual(['drawn', 'video'])
  const html = renderToStaticMarkup(<HomeAreas areas={areas} />)
  expect(html).toContain('aria-label="Play A sample video"')
  expect(html).toContain('aria-label="A sample video, 2 of 2"')
  expect(html).not.toMatch(/youtube|ytimg|<iframe/)
})
