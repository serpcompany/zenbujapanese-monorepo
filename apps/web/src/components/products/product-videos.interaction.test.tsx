import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { appScreenshots } from '@/lib/app-screenshots'
import type { AppVideo } from '@/lib/videos'
import { ProductVideos } from './product-videos'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

type Interceptor = {
  beforeAsyncRequest: (context: {
    request: { url: string }
    window: { Response: typeof Response }
  }) => Promise<Response>
}

const happyDOM = (
  window as unknown as {
    happyDOM: {
      settings: { fetch: { interceptor: Interceptor | null } }
      waitUntilComplete(): Promise<void>
    }
  }
).happyDOM

const sample: AppVideo = {
  youtubeId: 'not-a-real-video-id',
  title: 'A sample video',
  thumbnail: appScreenshots.imageSearch
}

let container: HTMLDivElement
let root: Root
let requested: string[]

beforeEach(() => {
  requested = []
  happyDOM.settings.fetch.interceptor = {
    beforeAsyncRequest: async ({ request, window }) => {
      requested.push(request.url)
      return new window.Response('<!doctype html><title>Player</title>')
    }
  }
  document.body.innerHTML = '<div id="root"></div>'
  container = document.getElementById('root') as HTMLDivElement
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  document.body.replaceChildren()
  happyDOM.settings.fetch.interceptor = null
})

const youtubeAddresses = () =>
  [...container.querySelectorAll('[src], [href], [srcset]')]
    .flatMap(element => ['src', 'href', 'srcset'].flatMap(name => element.getAttribute(name) ?? []))
    .filter(address => /youtube|ytimg/.test(address))

test('a video shows our own thumbnail and asks YouTube for nothing until it is played', async () => {
  act(() => root.render(<ProductVideos videos={[sample]} />))
  await happyDOM.waitUntilComplete()
  expect(requested).toEqual([])
  expect(container.querySelector('iframe')).toBeNull()
  expect(container.querySelector('script')).toBeNull()
  expect(youtubeAddresses()).toEqual([])
  expect(container.querySelector('img')?.getAttribute('src')).toBe(sample.thumbnail.src)
})

test('playing a video loads the privacy-enhanced YouTube player in its place', async () => {
  act(() => root.render(<ProductVideos videos={[sample]} />))
  const play = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Play A sample video"]'
  )
  await act(async () => play?.click())
  await happyDOM.waitUntilComplete()
  const player = 'https://www.youtube-nocookie.com/embed/not-a-real-video-id?autoplay=1&rel=0'
  expect(requested).toEqual([player])
  expect(container.querySelector('iframe')?.getAttribute('src')).toBe(player)
  expect(container.querySelector('iframe')?.getAttribute('title')).toBe('A sample video')
  expect(container.querySelector('button[aria-label="Play A sample video"]')).toBeNull()
  expect(document.activeElement).toBe(container.querySelector('iframe'))
})
