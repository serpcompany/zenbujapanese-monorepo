import { afterEach, describe, expect, it, vi } from 'vitest'
import english from '../captions/fixtures/netflix-english.xml?raw'
import {
  englishTrack,
  netflixEnglish,
  netflixLines,
  netflixTracks,
  netflixVideo
} from '../captions/fixtures/netflix-stand-in'
import { click } from '../test/render'
import { lineText, watching } from '../test/video-tab-harness'
import { netflixPage } from '../video/video-sites'
import { videoTabLabels } from './labels'

const lastLine = netflixLines[3]

let tab: ReturnType<typeof watching> | undefined

afterEach(() => {
  tab?.unmount()
  tab = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

const withoutLastLine = english.replace(/<p[^>]*>Into the room\.<\/p>/, '')

async function onNetflix(title: string, englishFile = withoutLastLine) {
  tab = watching({
    url: `https://www.netflix.com/watch/${netflixVideo}`,
    title,
    translator: englishFile === english ? 'downloadable' : 'available',
    site: { ...netflixPage(document), captionTracks: async () => netflixTracks }
  })
  tab.page.netflix.serve(englishTrack, englishFile)
  await tab.show(true)
  await vi.waitFor(() => expect(tab?.rows()).toHaveLength(netflixLines.length))
  return tab
}

const englishOf = (shown: ReturnType<typeof watching>) =>
  shown.rows().map(row => row.querySelector('[data-english]')?.textContent)

const translated = (shown: ReturnType<typeof watching>) =>
  shown.services.translate.mock.calls.flatMap(([request]) =>
    request.type === 'translate' ? request.texts : []
  )

describe('the Video tab on Netflix', () => {
  it("shows a Netflix video's lines with Netflix's own English, asking the Translator only for a line without", async () => {
    const shown = await onNetflix('Netflix')
    expect(shown.rows().map(lineText)).toEqual(netflixLines)
    await vi.waitFor(() =>
      expect(englishOf(shown)).toEqual([...netflixEnglish.slice(0, 3), undefined])
    )
    expect(translated(shown)).toEqual([lastLine])
    expect(shown.text('[data-video-title]')).toBeUndefined()
  })

  it("doesn't offer Chrome's model when Netflix gives every line English", async () => {
    const shown = await onNetflix('Netflix', english)
    await vi.waitFor(() => expect(englishOf(shown)).toEqual(netflixEnglish))
    expect(shown.services.availability).not.toHaveBeenCalled()
    expect(shown.text('[data-translation-model]')).toBeUndefined()
  })

  it("takes the title from the tab without Netflix's name, and plays from a card's line from its click", async () => {
    const shown = await onNetflix('散歩の日 - Netflix')
    expect(shown.text('[data-video-title]')).toBe('散歩の日')
    await click(shown.row(netflixLines[1])?.querySelector('button'))
    await vi.waitFor(() =>
      expect(shown.video.controls).toEqual([{ type: 'seek', time: 5.5 }, { type: 'play' }])
    )
  })

  it("opens a word's sheet from a click on it, pausing the video, and plays again once it closes", async () => {
    const shown = await onNetflix('Netflix')
    await shown.playsAt(6)
    await click(document.querySelector<HTMLElement>('[data-line] [data-source] [data-word="散歩"]'))
    await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'pause' }]))
    const sheet = document.querySelector('[data-word-sheet]')
    expect(sheet?.querySelector('[data-word-popup]')).not.toBeNull()
    await click(sheet?.querySelector(`button[aria-label="${videoTabLabels.closeWord}"]`))
    expect(document.querySelector('[data-word-sheet]')).toBeNull()
    await vi.waitFor(() =>
      expect(shown.video.controls).toEqual([{ type: 'pause' }, { type: 'play' }])
    )
  })
})
