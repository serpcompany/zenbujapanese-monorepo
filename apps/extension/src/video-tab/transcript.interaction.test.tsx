import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { japaneseLines } from '../captions/fixtures/youtube-stand-in'
import { captionLabels } from '../captions/labels'
import { labels } from '../shared/labels'
import { writeSettings } from '../shared/settings'
import { recheckMs } from '../shared/translation-model'
import { click, keyClick, settle } from '../test/render'
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

const sheet = () => document.querySelector<HTMLElement>('[data-word-sheet]')

const sheetButton = (name: string) =>
  sheet()?.querySelector<HTMLElement>(`button[aria-label="${name}"]`)

const walkWord = (word: string) => `[data-line] [data-source] [data-word="${word}"]`

const word = (text: string) => document.querySelector<HTMLElement>(walkWord(text))

async function pressEscape() {
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
  await settle()
}

async function playsAgain(shown: ReturnType<typeof watching>) {
  await vi.waitFor(() =>
    expect(shown.video.controls).toEqual([{ type: 'pause' }, { type: 'play' }])
  )
}

async function pausedForAWord() {
  const shown = await transcript()
  await shown.playsAt(12)
  await click(word('散歩'))
  await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'pause' }]))
  return shown
}

function particleAnswer() {
  const answer = popupAnswer('youkyuu')
  if (!answer.card) throw new Error('The stand-in has no card.')
  const meanings = [{ meaning: 'at, in', notes: [], partsOfSpeech: ['particle'] }]
  return { ...answer, card: { ...answer.card, card: { ...answer.card.card, meanings } } }
}

type PageAsk = { word: Parameters<PagePopup>[0]; heard: PagePopupHeard; ended: boolean }

function pageHolds() {
  const asked: PageAsk[] = []
  const pagePopup = vi.fn<PagePopup>((word, heard) => {
    const ask = { word, heard, ended: false }
    asked.push(ask)
    return () => {
      ask.ended = true
    }
  })
  return { asked, pagePopup }
}

async function sheetHoldingThePage() {
  const page = pageHolds()
  const shown = await transcript({ pagePopup: page.pagePopup })
  await shown.playsAt(12)
  await click(word('散歩'))
  await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'pause' }]))
  const heard = (at: number, what: keyof PagePopupHeard) =>
    act(async () => page.asked[at]?.heard[what]())
  return { shown, asked: page.asked, heard }
}

const meaningsIn = (row: Element | undefined) =>
  [...(row?.querySelectorAll('[data-aid="meaning"] [aria-hidden="true"]') ?? [])].map(
    found => found.textContent
  )

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

  it('puts no meaning under a particle, and keeps the particle with the word before it', async () => {
    tab = watching()
    await act(() => writeSettings({ 'readingAids.wordMeanings': true }))
    tab.services.segment.mockImplementation(async text => ({
      type: 'segment',
      tokens:
        text === '散歩に行きましょう'
          ? [
              { text: '散歩', reading: 'サンポ', languageReferenceID: 'sanpo' },
              { text: 'に', reading: 'ニ', languageReferenceID: 'ni' },
              { text: '行きましょう', reading: 'イキマショウ', languageReferenceID: 'iku' }
            ]
          : [{ text }],
      romaji: null
    }))
    tab.services.popupCard.mockImplementation(async id =>
      id === 'ni' ? particleAnswer() : popupAnswer('youkyuu')
    )
    const shown = tab
    await shown.show(true)
    await shown.lines()
    const row = () => shown.row('散歩に行きましょう')
    await vi.waitFor(() => expect(meaningsIn(row())).toEqual(['demand', 'demand']))
    expect(word('に')?.closest('[data-caption-group]')).toBe(
      word('散歩')?.closest('[data-caption-group]')
    )
    expect(word('行きましょう')?.closest('[data-caption-group]')).not.toBe(
      word('散歩')?.closest('[data-caption-group]')
    )
  })

  it('keeps the playing card in view, and moves the card of a word opened to the middle above its sheet', async () => {
    const scrolled: (string | undefined)[] = []
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      scrolled.push(lineText(this))
    })
    const shown = await transcript()
    await shown.playsAt(1)
    await shown.playsAt(12)
    expect(scrolled).toEqual(['おはようございます', '散歩に行きましょう'])
    await click(word('天気'))
    expect(scrolled).toEqual(['おはようございます', '散歩に行きましょう', '今日は"いい天気"ですね'])
    await shown.playsAt(1)
    expect(scrolled).toHaveLength(3)
  })
})

describe('a word’s sheet', () => {
  it('opens over the lower half of the tab from a click on a word, and pauses the video', async () => {
    const shown = await pausedForAWord()
    expect(sheet()?.contains(popup())).toBe(true)
    expect(sheet()?.hasAttribute('data-full')).toBe(false)
    expect(word('散歩')?.hasAttribute('data-selected')).toBe(true)
    expect(shown.current()).toBe('散歩に行きましょう')
  })

  it('closes from its X, and plays the video again', async () => {
    const shown = await pausedForAWord()
    await click(sheetButton(videoTabLabels.closeWord))
    expect(sheet()).toBeNull()
    expect(word('散歩')?.hasAttribute('data-selected')).toBe(false)
    await playsAgain(shown)
  })

  it('closes from Esc, and plays the video again', async () => {
    const shown = await pausedForAWord()
    await pressEscape()
    expect(sheet()).toBeNull()
    await playsAgain(shown)
  })

  it('goes to full height from its handle, and back to half', async () => {
    await pausedForAWord()
    await click(sheetButton(videoTabLabels.fullHeight))
    expect(sheet()?.hasAttribute('data-full')).toBe(true)
    await click(sheetButton(videoTabLabels.halfHeight))
    expect(sheet()?.hasAttribute('data-full')).toBe(false)
  })

  it('puts the notices above the cards away while it shows, so the word’s line fits above it', async () => {
    const shown = await transcript({ translator: 'downloadable' })
    const notice = () => shown.panel.querySelector('[data-translation-model]')
    const putAway = () => notice()?.closest('[hidden]') != null
    await vi.waitFor(() => expect(notice()).not.toBeNull())
    expect(putAway()).toBe(false)
    await click(word('散歩'))
    expect(putAway()).toBe(true)
    await click(sheetButton(videoTabLabels.closeWord))
    expect(putAway()).toBe(false)
  })

  it('shows another word in the same sheet at the same height, and plays again only once it closes', async () => {
    const shown = await pausedForAWord()
    await click(sheetButton(videoTabLabels.fullHeight))
    await click(word('天気'))
    expect(document.querySelectorAll('[data-word-sheet], [data-word-popup]')).toHaveLength(2)
    expect(sheet()?.hasAttribute('data-full')).toBe(true)
    expect(word('天気')?.hasAttribute('data-selected')).toBe(true)
    expect(word('散歩')?.hasAttribute('data-selected')).toBe(false)
    expect(shown.video.controls).toEqual([{ type: 'pause' }])
    await pressEscape()
    await playsAgain(shown)
  })

  it('closes with no play of its own from a click on a card, which plays from that card’s line', async () => {
    const shown = await pausedForAWord()
    await click(shown.row('今日は"いい天気"ですね')?.querySelector('[data-play-line]'))
    expect(sheet()).toBeNull()
    await vi.waitFor(() =>
      expect(shown.video.controls).toEqual([
        { type: 'pause' },
        { type: 'seek', time: 5.4 },
        { type: 'play' }
      ])
    )
  })

  it('leaves a paused video paused when it closes', async () => {
    const shown = await transcript()
    await click(word('散歩'))
    await pressEscape()
    expect(shown.services.control).toHaveBeenCalledExactlyOnceWith(5, { type: 'pause' })
  })

  it('plays the video again when the transcript closes with the sheet open', async () => {
    const shown = await pausedForAWord()
    shown.close()
    await playsAgain(shown)
  })

  it('takes focus when a key opens it, and gives it back to the word when it closes', async () => {
    await transcript()
    await keyClick(word('散歩'))
    expect(popup()?.contains(document.activeElement)).toBe(true)
    await pressEscape()
    expect(document.activeElement).toBe(word('散歩'))
  })

  it('expands the card in place into the word’s full entry', async () => {
    const shown = await transcript()
    shown.services.popupCard.mockImplementation(async () => popupAnswer('youkyuu'))
    await click(word('散歩'))
    await click(openFullEntryButton(document))
    expect(sheet()?.contains(popup())).toBe(true)
    expect(popup()?.hasAttribute('data-expanded')).toBe(true)
    expect(shown.open).not.toHaveBeenCalled()
  })
})

describe('a word’s sheet and the page', () => {
  it('asks the page to take any word card down and hold its place, once while the sheet shows any word, until it closes', async () => {
    const { shown, asked } = await sheetHoldingThePage()
    await click(word('天気'))
    expect(asked.map(ask => ask.word)).toEqual([
      expect.objectContaining({ text: '散歩', fromBottom: 0, inPanel: true })
    ])
    expect(asked[0]?.ended).toBe(false)
    await pressEscape()
    expect(asked[0]?.ended).toBe(true)
    await playsAgain(shown)
  })

  it('goes away when a word card on the page takes its place, and plays the video again only once the page’s last card closes', async () => {
    const { shown, heard } = await sheetHoldingThePage()
    await heard(0, 'replaced')
    expect(sheet()).toBeNull()
    expect(word('散歩')?.hasAttribute('data-selected')).toBe(false)
    expect(shown.video.controls).toEqual([{ type: 'pause' }])
    await heard(0, 'closed')
    await playsAgain(shown)
  })

  it('takes the place back from the page’s card when a word opens again, keeping the video paused until the sheet closes', async () => {
    const { shown, asked, heard } = await sheetHoldingThePage()
    await heard(0, 'replaced')
    await click(word('天気'))
    expect(sheet()?.contains(popup())).toBe(true)
    expect(asked.map(ask => ask.word.text)).toEqual(['散歩', '天気'])
    await heard(0, 'closed')
    expect(sheet()).not.toBeNull()
    expect(shown.video.controls).toEqual([{ type: 'pause' }])
    await pressEscape()
    expect(asked[1]?.ended).toBe(true)
    await playsAgain(shown)
  })

  it('closes, and plays the video again, when a card asked for on another tab ends its hold', async () => {
    const { shown, heard } = await sheetHoldingThePage()
    await heard(0, 'closed')
    expect(sheet()).toBeNull()
    await playsAgain(shown)
  })

  it('stays open on a tab whose page can’t hold a card', async () => {
    const { shown, heard } = await sheetHoldingThePage()
    await heard(0, 'unavailable')
    expect(sheet()?.contains(popup())).toBe(true)
    await pressEscape()
    await playsAgain(shown)
  })
})
