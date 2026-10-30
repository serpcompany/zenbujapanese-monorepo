import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { japaneseLines } from '../captions/fixtures/youtube-stand-in'
import { captionLabels } from '../captions/labels'
import { labels } from '../shared/labels'
import { settingDefaults, writeSettings } from '../shared/settings'
import { recheckMs } from '../shared/translation-model'
import { type FakePort, fakePort, portPair } from '../test/fake-port'
import { fakePopupHost, fakeRuntime } from '../test/page-frame'
import { click, keyClick, pointerClick, settle } from '../test/render'
import { lineEnglish, lineText, watching } from '../test/video-tab-harness'
import { openFullEntryButton, popupAnswer } from '../test/word-cards'
import { translateLabels } from '../translate/labels'
import { type PagePopup, type PagePopupHeard, popupOnActiveTab } from '../word-popup/page-popup'
import { servePagePopups } from '../word-popup/page-popup-server'
import { videoTabLabels } from './labels'

let tab: ReturnType<typeof watching> | undefined
let stopPage: (() => void) | undefined

afterEach(() => {
  tab?.unmount()
  tab = undefined
  stopPage?.()
  stopPage = undefined
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

function cardsOnActiveTab() {
  const active = { tab: 5 }
  const ports: FakePort[] = []
  const pagePopup = popupOnActiveTab({
    activeTab: async () => active.tab,
    side: async () => 'right',
    connect: () => {
      const port = fakePort()
      ports.push(port)
      return port
    },
    lastError: () => undefined
  })
  const elsewhere = () =>
    pagePopup(
      { text: '要求', ids: ['youkyuu'], fromBottom: 0 },
      { shown: () => {}, closed: () => {}, unavailable: () => {} }
    )
  return { active, ports, pagePopup, elsewhere }
}

async function aRowCardShown(cards: ReturnType<typeof cardsOnActiveTab>, playing = true) {
  const shown = await transcript({ pagePopup: cards.pagePopup })
  if (playing) await shown.playsAt(12)
  await pointerClick(document.querySelector(walkWord('散歩')))
  await vi.waitFor(() => expect(cards.ports).toHaveLength(1))
  await act(async () => cards.ports[0]?.say({ target: 'word-popup', shown: true }))
  await vi.waitFor(() => expect(shown.services.control).toHaveBeenCalledWith(5, { type: 'pause' }))
  return shown
}

const captionWord = { text: '天気', ids: ['tenki'], edge: { side: 'right' as const, top: 0 } }

async function aWordCardOnThePage() {
  const frame = fakeRuntime()
  const panelCards = fakePopupHost()
  stopPage = servePagePopups({
    runtime: frame.runtime,
    view: window,
    settings: { ask: async () => settingDefaults, onChanged: () => () => {} },
    on: () => true,
    popup: () => panelCards
  })
  const pagePopup = popupOnActiveTab({
    activeTab: async () => 5,
    side: async () => 'right',
    connect: () => {
      const { panel, page } = portPair()
      frame.accept(page)
      return panel
    },
    lastError: () => undefined
  })
  const shown = await transcript({ pagePopup })
  await shown.playsAt(12)
  await pointerClick(document.querySelector(walkWord('散歩')))
  await vi.waitFor(() => expect(panelCards.shown()).not.toBeNull())
  await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'pause' }]))
  return { shown, panelCards, captionCards: fakePopupHost() }
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
    await pointerClick(document.querySelector(walkWord('散歩')))
    await act(async () => heard[0]?.shown())
    expect(pagePopup.mock.calls[0]?.[0]).toMatchObject({ text: '散歩' })
    expect(popup()).toBeNull()
    await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'pause' }]))

    await pointerClick(document.querySelector(walkWord('天気')))
    await act(async () => heard[1]?.shown())
    expect(closes[0]).toHaveBeenCalledOnce()
    expect(popup()).toBeNull()
    expect(shown.video.controls).toEqual([{ type: 'pause' }])

    await act(async () => heard[1]?.closed())
    await playsAgain(shown)
  })
  it('shows a word’s card in the panel, with focus in it and the video paused, when a key opens it, and a click still opens one on the page', async () => {
    const pagePopup = vi.fn<PagePopup>(() => () => {})
    const shown = await transcript({ pagePopup })
    await shown.playsAt(12)
    const word = document.querySelector<HTMLElement>(walkWord('散歩'))
    await keyClick(word)
    expect(pagePopup).not.toHaveBeenCalled()
    expect(popup()?.closest('[data-line]')).not.toBeNull()
    expect(popup()?.contains(document.activeElement)).toBe(true)
    await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'pause' }]))
    await act(async () =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    )
    await settle()
    expect(popup()).toBeNull()
    expect(document.activeElement).toBe(word)
    await playsAgain(shown)

    await pointerClick(document.querySelector(walkWord('天気')))
    expect(pagePopup.mock.calls[0]?.[0]).toMatchObject({ text: '天気' })
    expect(popup()).toBeNull()
  })

  it('keeps the video paused while another card on the page takes the place of a word’s card, and plays it when the last one closes', async () => {
    const { shown, panelCards, captionCards } = await aWordCardOnThePage()
    await act(async () => captionCards.open(captionWord))
    await settle()
    expect(panelCards.shown()).toBeNull()
    expect(shown.video.controls).toEqual([{ type: 'pause' }])

    await act(async () => captionCards.close())
    await playsAgain(shown)
  })

  it('keeps the video paused when a press on the page closes a word’s card and opens another', async () => {
    const { shown, panelCards, captionCards } = await aWordCardOnThePage()
    await act(async () => {
      window.dispatchEvent(new Event('pointerdown'))
      panelCards.close()
      captionCards.open(captionWord)
      window.dispatchEvent(new Event('pointerup'))
    })
    await settle()
    expect(shown.video.controls).toEqual([{ type: 'pause' }])

    await act(async () => captionCards.close())
    await playsAgain(shown)
  })

  it('plays the video again when a card asked for on another tab takes a row’s card off the tab the learner left', async () => {
    const cards = cardsOnActiveTab()
    const shown = await aRowCardShown(cards)
    cards.active.tab = 8
    await act(async () => void cards.elsewhere())
    await settle()
    expect(cards.ports[0]?.disconnected).toBe(true)
    await playsAgain(shown)
  })

  it('leaves a video paused before the card paused when another tab’s card takes the row’s card away', async () => {
    const cards = cardsOnActiveTab()
    const shown = await aRowCardShown(cards, false)
    cards.active.tab = 8
    await act(async () => void cards.elsewhere())
    await settle()
    expect(cards.ports[0]?.disconnected).toBe(true)
    expect(shown.services.control).toHaveBeenCalledExactlyOnceWith(5, { type: 'pause' })
  })

  it('plays the video again when a card that can’t be shown on the page takes a row’s card off it', async () => {
    const cards = cardsOnActiveTab()
    const shown = await aRowCardShown(cards)
    await act(async () => void cards.elsewhere())
    await vi.waitFor(() => expect(cards.ports).toHaveLength(2))
    await act(async () => cards.ports[1]?.drop())
    await settle()
    expect(cards.ports[0]?.disconnected).toBe(true)
    await playsAgain(shown)
  })

  it('keeps the video paused when a word in another row is clicked before the page shows the first card', async () => {
    const cards = cardsOnActiveTab()
    const shown = await transcript({ pagePopup: cards.pagePopup })
    await shown.playsAt(12)
    await pointerClick(document.querySelector(walkWord('散歩')))
    await pointerClick(document.querySelector(walkWord('天気')))
    await vi.waitFor(() => expect(cards.ports).toHaveLength(2))
    await settle()
    expect(cards.ports[0]?.disconnected).toBe(true)
    expect(shown.video.controls).toEqual([{ type: 'pause' }])
    await act(async () => cards.ports[1]?.say({ target: 'word-popup', shown: true }))
    await act(async () => cards.ports[1]?.drop())
    await playsAgain(shown)
  })
})
