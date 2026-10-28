import { act, type ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  englishVideo,
  japaneseLines,
  japaneseVideo,
  secondJapaneseVideo
} from '../captions/fixtures/youtube-stand-in'
import { captionLabels } from '../captions/labels'
import { labels as panelLabels } from '../side-panel/labels'
import type { PanelTabProps } from '../side-panel/route'
import { click, settle } from '../test/render'
import { lineText, tabId, watching, watchURL } from '../test/video-tab-harness'
import { videoTabLabels } from './labels'
import { VideoTab } from './video-tab'

let tab: ReturnType<typeof watching> | undefined

afterEach(() => {
  tab?.unmount()
  tab = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

async function showing(options?: Parameters<typeof watching>[0]) {
  tab = watching(options)
  await tab.show(true)
  return tab
}

describe('the Video tab', () => {
  it('fits the side panel’s tab contract', () => {
    const content: ComponentType<PanelTabProps> = VideoTab
    expect(content).toBe(VideoTab)
  })

  it('shows the video’s title over its lines, each with the time it starts', async () => {
    const shown = await showing()
    await shown.lines()
    expect(shown.text('[data-video-title]')).toBe('散歩の日')
    expect(shown.rows().map(lineText)).toEqual(japaneseLines)
    expect(shown.rows().map(row => row.querySelector('button')?.textContent)).toEqual([
      '0:00',
      '0:05',
      '0:11'
    ])
    expect(shown.services.askCaptions).toHaveBeenCalledExactlyOnceWith({ type: 'captions', tabId })
  })

  it('highlights the row of the line playing, and follows the line as it plays', async () => {
    const shown = await showing()
    await shown.lines()
    expect(shown.current()).toBeUndefined()
    await shown.playsAt(1)
    expect(shown.current()).toBe('おはようございます')
    await shown.playsAt(6)
    expect(shown.current()).toBe('今日は"いい天気"ですね')
    await shown.playsAt(9.5)
    expect(shown.current()).toBeUndefined()
    await shown.playsAt(12)
    expect(shown.current()).toBe('散歩に行きましょう')
  })

  it('seeks the video to a row’s start from a click on the row', async () => {
    const shown = await showing()
    await shown.lines()
    await click(shown.row('散歩に行きましょう')?.querySelector('button'))
    await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'seek', time: 11.2 }]))
    await vi.waitFor(() => expect(shown.current()).toBe('散歩に行きましょう'))
    expect(
      shown.row('散歩に行きましょう')?.querySelector('button')?.getAttribute('aria-label')
    ).toBe(videoTabLabels.goTo(11.2))
  })

  it('during an ad, highlights no row and a row’s click does nothing', async () => {
    const shown = await showing()
    await shown.lines()
    await shown.playsAt(6)
    await act(async () => shown.video.adStarts())
    await settle()
    expect(shown.current()).toBeUndefined()
    await click(shown.row('おはようございます')?.querySelector('button'))
    expect(shown.services.control).not.toHaveBeenCalled()
    await act(async () => shown.video.adEnds())
    await settle()
    expect(shown.current()).toBe('今日は"いい天気"ですね')
  })

  it('shows No video on this tab for a tab with no video, and asks nothing', async () => {
    const shown = await showing({ url: 'https://www.youtube.com/results?search_query=japanese' })
    await settle()
    expect(shown.emptyTitle()).toBe(panelLabels.empty.video.title)
    expect(shown.services.askCaptions).not.toHaveBeenCalled()
  })

  it('shows No Japanese Captions for a video without them', async () => {
    const shown = await showing({ url: watchURL(englishVideo) })
    await vi.waitFor(() => expect(shown.emptyTitle()).toBe(captionLabels.noJapaneseCaptions))
    expect(shown.rows()).toEqual([])
  })

  it('shows the rate-limit line, and its Try again asks YouTube again now', async () => {
    tab = watching()
    tab.page.youTube.answerTimedText(429)
    const shown = tab
    await shown.show(true)
    await vi.waitFor(() =>
      expect(shown.text('[data-captions-notice] p')).toMatch(/isn't sending captions/)
    )
    expect(shown.text('[data-captions-notice] p')).toMatch(/try again in \d+ minutes\.$/)
    shown.page.youTube.answerTimedText(200)
    await click(shown.button(captionLabels.tryAgain))
    await shown.lines()
    expect(shown.services.askCaptions).toHaveBeenLastCalledWith({ type: 'try-again', tabId })
  })

  it('shows a failed line with Try again, which asks again', async () => {
    tab = watching()
    tab.page.youTube.answerTimedText(500)
    const shown = tab
    await shown.show(true)
    await vi.waitFor(() =>
      expect(shown.text('[data-captions-notice] p')).toBe(captionLabels.failed.refused)
    )
    shown.page.youTube.answerTimedText(200)
    await click(shown.button(captionLabels.tryAgain))
    await shown.lines()
  })

  it('says it is getting the captions until they come', async () => {
    tab = watching({ captionsOn: false })
    tab.services.askCaptions.mockReturnValueOnce(new Promise(() => {}))
    await tab.show(true)
    await settle()
    expect(tab.text('[data-video-tab] p')).toBe(videoTabLabels.loading)
    expect(tab.rows()).toEqual([])
  })

  it('says Zenbu didn’t answer when the service worker fails, with Try again', async () => {
    tab = watching()
    const shown = tab
    shown.services.askCaptions.mockRejectedValueOnce(new Error('Receiving end does not exist.'))
    await shown.show(true)
    await vi.waitFor(() =>
      expect(shown.text('[data-captions-notice] p')).toBe(videoTabLabels.noAnswer)
    )
    await click(shown.button(captionLabels.tryAgain))
    await shown.lines()
  })

  it('with Zenbu Captions off, still asks for the captions and shows them', async () => {
    const shown = await showing({ captionsOn: false })
    await shown.lines()
    expect(shown.page.youTube.timedTextRequests()).toBe(1)
  })

  it('with Zenbu Captions off, gets the next video’s lines while shown, and asks nothing for it hidden or closed', async () => {
    const shown = await showing({ captionsOn: false })
    await shown.lines()
    await shown.navigate(secondJapaneseVideo)
    await shown.lines()
    expect(shown.page.youTube.timedTextRequests()).toBe(2)
    await shown.show(false)
    await shown.navigate(japaneseVideo)
    await shown.navigate(secondJapaneseVideo)
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(shown.page.youTube.timedTextRequests()).toBe(2)
    expect(shown.services.askCaptions).toHaveBeenCalledTimes(2)
    shown.close()
    await shown.navigate(japaneseVideo)
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(shown.page.youTube.timedTextRequests()).toBe(2)
  })

  it('in a tab with no content script, says to reload it, and follows the video once reloaded', async () => {
    const shown = await showing({ contentScript: false })
    await shown.lines()
    await vi.waitFor(() =>
      expect(shown.text('[data-reload-notice] p')).toBe(videoTabLabels.reloadToFollow)
    )
    await shown.retry()
    expect(shown.text('[data-reload-notice] p')).toBe(videoTabLabels.reloadToFollow)
    await click(shown.button(videoTabLabels.reload))
    expect(shown.services.reload).toHaveBeenCalledExactlyOnceWith(tabId)
    await shown.retry()
    await vi.waitFor(() => expect(shown.panel.querySelector('[data-reload-notice]')).toBeNull())
    await shown.playsAt(1)
    expect(shown.current()).toBe('おはようございます')
  })

  it('reads the tab, asks for captions and follows the video only once it is shown', async () => {
    tab = watching()
    const shown = tab
    await shown.show(false)
    await settle()
    expect(shown.services.activeTab).not.toHaveBeenCalled()
    expect(shown.services.askCaptions).not.toHaveBeenCalled()
    expect(shown.video.listening()).toBe(0)
    await shown.show(true)
    await shown.lines()
    await vi.waitFor(() => expect(shown.video.listening()).toBe(1))
    await shown.show(false)
    await vi.waitFor(() => expect(shown.video.listening()).toBe(0))
    expect(shown.rows()).toHaveLength(3)
    await shown.show(true)
    await vi.waitFor(() => expect(shown.video.listening()).toBe(1))
    expect(shown.services.askCaptions).toHaveBeenCalledTimes(1)
  })

  it('follows the active tab, to a tab with no video and back', async () => {
    const shown = await showing()
    await shown.lines()
    await shown.move({ id: 9, url: 'https://example.com/', title: 'Example' })
    expect(shown.emptyTitle()).toBe(panelLabels.empty.video.title)
    await shown.move({ id: tabId, url: watchURL(), title: '散歩の日 - YouTube' })
    await shown.lines()
    expect(shown.text('[data-video-title]')).toBe('散歩の日')
  })
})
