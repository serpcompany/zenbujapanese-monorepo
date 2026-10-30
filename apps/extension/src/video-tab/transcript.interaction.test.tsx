import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { japaneseLines } from '../captions/fixtures/youtube-stand-in'
import { captionLabels } from '../captions/labels'
import { labels } from '../shared/labels'
import { writeSettings } from '../shared/settings'
import { recheckMs } from '../shared/translation-model'
import { click, settle } from '../test/render'
import { lineEnglish, lineText, watching } from '../test/video-tab-harness'
import { openFullEntryButton, popupAnswer } from '../test/word-cards'
import { translateLabels } from '../translate/labels'
import type { PagePopup, PagePopupHeard } from '../word-popup/page-popup'
import { videoTabLabels } from './labels'

let tab: ReturnType<typeof watching> | undefined

afterEach(() => {
  tab?.unmount()
  tab = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function transcript(options?: Parameters<typeof watching>[0]) {
  tab = watching(options)
  await tab.show(true)
  await tab.lines()
  return tab
}

const englishOf = (shown: ReturnType<typeof watching>) =>
  shown.rows().map(row => row.querySelector('[data-english]')?.textContent)

const popup = () => document.querySelector('[data-word-popup]')

const walkWord = (word: string) => `[data-line] [data-source] [data-word="${word}"]`

async function pressEscape() {
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
  await settle()
}

async function playsAgain(shown: ReturnType<typeof watching>) {
  await vi.waitFor(() =>
    expect(shown.video.controls).toEqual([{ type: 'pause' }, { type: 'play' }])
  )
}

async function closesAndPlaysAgain(shown: ReturnType<typeof watching>) {
  await pressEscape()
  expect(popup()).toBeNull()
  await playsAgain(shown)
}

async function pausedForAWord() {
  const shown = await transcript()
  await shown.playsAt(12)
  await click(document.querySelector(walkWord('散歩')))
  await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'pause' }]))
  return shown
}

describe('the transcript’s English', () => {
  it('gives each row its own English, a line at a time', async () => {
    const shown = await transcript()
    await vi.waitFor(() =>
      expect(englishOf(shown)).toEqual(japaneseLines.map(line => lineEnglish[line]))
    )
    expect(shown.services.translate).toHaveBeenCalledTimes(3)
    for (const line of japaneseLines)
      expect(shown.services.translate).toHaveBeenCalledWith({
        type: 'translate',
        direction: { from: 'ja', to: 'en' },
        texts: [line]
      })
    expect(
      shown.rows().map(row => row.querySelector('[data-english]')?.getAttribute('lang'))
    ).toEqual(['en', 'en', 'en'])
  })

  it('before the download, starts it only from a click on Download, showing its progress', async () => {
    const shown = await transcript({ translator: 'downloadable' })
    await vi.waitFor(() =>
      expect(shown.text('[data-translation-model] p')).toBe(videoTabLabels.englishNeedsDownload)
    )
    await settle()
    expect(shown.services.download).not.toHaveBeenCalled()
    expect(englishOf(shown)).toEqual([undefined, undefined, undefined])
    await click(shown.button(labels.translation.download))
    expect(shown.services.download).toHaveBeenCalledOnce()
    expect(shown.panel.querySelector('progress')?.value).toBe(0.42)
    await shown.finishDownload()
    await vi.waitFor(() =>
      expect(englishOf(shown)).toEqual(japaneseLines.map(line => lineEnglish[line]))
    )
    expect(shown.panel.querySelector('[data-translation-model]')).toBeNull()
  })

  it('while Chrome is already downloading, says so with no Download, and shows the English once a check finds the model', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    const shown = await transcript({ translator: 'downloading' })
    await vi.waitFor(() =>
      expect(shown.text('[data-translation-model]')).toBe(labels.translation.chromeDownloading)
    )
    expect(shown.button(labels.translation.download)).toBeUndefined()
    shown.services.availability.mockResolvedValue('available')
    shown.services.translate.mockImplementation(async request => ({
      type: 'translated',
      texts: request.type === 'translate' ? request.texts.map(text => lineEnglish[text] ?? '') : []
    }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(recheckMs)
    })
    await vi.waitFor(() =>
      expect(englishOf(shown)).toEqual(japaneseLines.map(line => lineEnglish[line]))
    )
    expect(shown.panel.querySelector('[data-translation-model]')).toBeNull()
    expect(shown.services.download).not.toHaveBeenCalled()
  })

  it('says so when the download fails, and Download starts it again', async () => {
    const shown = await transcript({ translator: 'downloadable' })
    shown.services.download.mockRejectedValueOnce(new Error('The download stopped.'))
    await vi.waitFor(() => expect(shown.button(labels.translation.download)).toBeDefined())
    await click(shown.button(labels.translation.download))
    await vi.waitFor(() =>
      expect(shown.text('[data-translation-model] p')).toBe(labels.translation.downloadFailed)
    )
    await click(shown.button(labels.translation.download))
    await shown.finishDownload()
    await vi.waitFor(() =>
      expect(englishOf(shown)).toEqual(japaneseLines.map(line => lineEnglish[line]))
    )
    expect(shown.services.download).toHaveBeenCalledTimes(2)
  })

  it('says so when this computer can’t translate Japanese', async () => {
    const shown = await transcript({ translator: 'unavailable' })
    await vi.waitFor(() =>
      expect(shown.panel.textContent).toContain(translateLabels.notices.unavailable)
    )
    expect(shown.services.translate).not.toHaveBeenCalled()
  })

  it('shows Try again on a line Translate didn’t answer, which asks for that line again', async () => {
    tab = watching()
    tab.services.translate.mockResolvedValueOnce({
      type: 'failed',
      reason: 'The Translator timed out.'
    })
    const shown = tab
    await shown.show(true)
    await shown.lines()
    const first = () => shown.row('おはようございます')
    await vi.waitFor(() =>
      expect(first()?.querySelector('[data-english-failed] p')?.textContent).toBe(
        videoTabLabels.englishFailed
      )
    )
    expect(englishOf(shown).slice(1)).toEqual(japaneseLines.slice(1).map(line => lineEnglish[line]))
    const tryAgain = [...(first()?.querySelectorAll('button') ?? [])].find(
      button => button.textContent === captionLabels.tryAgain
    )
    await click(tryAgain)
    await vi.waitFor(() =>
      expect(englishOf(shown)).toEqual(japaneseLines.map(line => lineEnglish[line]))
    )
    expect(first()?.querySelector('[data-english-failed]')).toBeNull()
    expect(shown.services.translate).toHaveBeenCalledTimes(4)
  })

  it('hides the English with Translations off, and asks for none', async () => {
    tab = watching()
    await act(() => writeSettings({ 'readingAids.translations': false }))
    await tab.show(true)
    await tab.lines()
    await settle()
    expect(englishOf(tab)).toEqual([undefined, undefined, undefined])
    expect(tab.services.translate).not.toHaveBeenCalled()
    expect(tab.services.availability).not.toHaveBeenCalled()
  })
})

describe('the transcript’s words', () => {
  it('follows the reading aids in the settings', async () => {
    const shown = await transcript()
    shown.services.popupCard.mockImplementation(async () => popupAnswer('youkyuu'))
    const aids = () => shown.row('散歩に行きましょう')?.querySelector('[data-reading-aids]')
    const meanings = () =>
      [...(aids()?.querySelectorAll('[data-aid="meaning"] [aria-hidden="true"]') ?? [])].map(
        found => found.textContent
      )
    await vi.waitFor(() => expect(aids()?.getAttribute('data-furigana')).toBe('on'))
    expect(aids()?.getAttribute('data-romaji')).toBe('off')
    expect(meanings()).toEqual([])
    await act(() =>
      writeSettings({
        'readingAids.furigana': false,
        'readingAids.romaji': true,
        'readingAids.wordMeanings': true
      })
    )
    await settle()
    expect(aids()?.getAttribute('data-furigana')).toBe('off')
    expect(aids()?.getAttribute('data-romaji')).toBe('on')
    expect(aids()?.querySelector('[data-aid="romaji"]')?.textContent).toBe('sanpo ni ikimashou')
    await vi.waitFor(() => expect(meanings()).toEqual(['demand', 'demand']))
  })

  it('looks up a word’s meaning once for the whole transcript', async () => {
    tab = watching()
    await act(() => writeSettings({ 'readingAids.wordMeanings': true }))
    tab.services.segment.mockImplementation(async text => ({
      type: 'segment',
      tokens: [{ text, reading: 'ヨウキュウ', languageReferenceID: 'youkyuu' }],
      romaji: null
    }))
    tab.services.popupCard.mockImplementation(async () => popupAnswer('youkyuu'))
    const shown = tab
    await shown.show(true)
    await shown.lines()
    await vi.waitFor(() =>
      expect(shown.panel.querySelectorAll('[data-line] [data-aid="meaning"]')).toHaveLength(3)
    )
    expect(shown.services.popupCard).toHaveBeenCalledExactlyOnceWith('youkyuu', [])
  })

  it('keeps the playing row in view, and leaves the list still while a popup is open', async () => {
    const scrolled: (string | undefined)[] = []
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      scrolled.push(lineText(this))
    })
    const shown = await transcript()
    await shown.playsAt(1)
    await shown.playsAt(12)
    expect(scrolled).toEqual(['おはようございます', '散歩に行きましょう'])
    await click(document.querySelector(walkWord('散歩')))
    await shown.playsAt(6)
    expect(shown.current()).toBe('今日は"いい天気"ですね')
    expect(scrolled).toHaveLength(2)
  })

  it('opens a word’s popup and pauses the video, then plays it again when the popup closes', async () => {
    const shown = await transcript()
    await shown.playsAt(12)
    await click(document.querySelector(walkWord('散歩')))
    expect(popup()).not.toBeNull()
    await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'pause' }]))
    await closesAndPlaysAgain(shown)
  })

  it('closes the popup on a press outside it, and plays the video again', async () => {
    const shown = await pausedForAWord()
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    await settle()
    expect(popup()).toBeNull()
    await playsAgain(shown)
  })

  it('plays the video again when the transcript closes with a popup open', async () => {
    const shown = await pausedForAWord()
    shown.close()
    await playsAgain(shown)
  })

  it('leaves a paused video paused when the popup closes', async () => {
    const shown = await transcript()
    await click(document.querySelector(walkWord('散歩')))
    await pressEscape()
    expect(shown.services.control).toHaveBeenCalledExactlyOnceWith(5, { type: 'pause' })
  })

  it('keeps one popup open at a time, and plays again only once the last closes', async () => {
    const shown = await transcript()
    await shown.playsAt(12)
    await click(document.querySelector(walkWord('散歩')))
    await click(document.querySelector(walkWord('天気')))
    await click(document.querySelector(walkWord('行きましょう')))
    expect(document.querySelectorAll('[data-word-popup]')).toHaveLength(1)
    expect(shown.video.controls).toEqual([{ type: 'pause' }])
    await closesAndPlaysAgain(shown)
  })

  it('expands the popup in place into the word’s full entry where the page can’t show the card', async () => {
    const shown = await transcript()
    shown.services.popupCard.mockImplementation(async () => popupAnswer('youkyuu'))
    await click(document.querySelector(walkWord('散歩')))
    await click(openFullEntryButton(document))
    expect(popup()?.hasAttribute('data-expanded')).toBe(true)
    expect(shown.open).not.toHaveBeenCalled()
  })

  it('opens a word’s card on the page with no card in the panel, pausing the video until the page closes the last one', async () => {
    const heard: PagePopupHeard[] = []
    const closes: (() => void)[] = []
    const pagePopup = vi.fn<PagePopup>((_word, listener) => {
      heard.push(listener)
      const close = vi.fn()
      closes.push(close)
      return close
    })
    const shown = await transcript({ pagePopup })
    await shown.playsAt(12)
    await click(document.querySelector(walkWord('散歩')))
    await act(async () => heard[0]?.shown())
    expect(pagePopup.mock.calls[0]?.[0]).toMatchObject({ text: '散歩' })
    expect(popup()).toBeNull()
    await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'pause' }]))

    await click(document.querySelector(walkWord('天気')))
    await act(async () => heard[1]?.shown())
    expect(closes[0]).toHaveBeenCalledOnce()
    expect(popup()).toBeNull()
    expect(shown.video.controls).toEqual([{ type: 'pause' }])

    await act(async () => heard[1]?.closed())
    await playsAgain(shown)
  })
})
