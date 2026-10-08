import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { VideoCard } from '@/components/products/product-videos'
import { sampleVideo } from '@/test/sample-video'
import { AreaShowcase, type ShowcaseArea } from './area-showcase'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const youtubeStandIn = {
  beforeAsyncRequest: async ({ window }: { window: { Response: typeof Response } }) =>
    new window.Response('<!doctype html><title>Player</title>')
}

const happyDOMFetch = (
  window as unknown as { happyDOM: { settings: { fetch: { interceptor: unknown } } } }
).happyDOM.settings.fetch

const area = (id: string, name: string, media: ShowcaseArea['media']): ShowcaseArea => ({
  id,
  name,
  icon: null,
  pitch: `${name} pitch`,
  features: [`${name} point`],
  media
})

const areas = [
  area('player', 'Player', [
    {
      key: sampleVideo.youtubeId,
      label: sampleVideo.title,
      shape: 'card',
      content: <VideoCard video={sampleVideo} />
    }
  ]),
  area('lists', 'Lists', [])
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  happyDOMFetch.interceptor = youtubeStandIn
  document.body.innerHTML = '<div id="root"></div>'
  container = document.getElementById('root') as HTMLDivElement
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  document.body.replaceChildren()
  happyDOMFetch.interceptor = null
})

const button = (selector: string) => {
  const found = container.querySelector<HTMLButtonElement>(selector)
  if (!found) throw new Error(`No ${selector}`)
  return found
}

test('a video playing in an area stops when another area is chosen', () => {
  act(() => root.render(<AreaShowcase label="Areas" areas={areas} />))
  act(() => button('button[aria-label="Play A sample video"]').click())
  expect(container.querySelector('iframe')?.getAttribute('title')).toBe(sampleVideo.title)
  act(() => button('[role="tab"]:not([aria-selected="true"])').click())
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Lists')
  expect(container.querySelector('iframe')).toBeNull()
  expect(container.querySelector('button[aria-label="Play A sample video"]')).not.toBeNull()
})
