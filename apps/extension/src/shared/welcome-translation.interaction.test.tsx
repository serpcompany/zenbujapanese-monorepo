import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { japaneseLines } from '../captions/fixtures/youtube-stand-in'
import { startExtension } from '../test/extension'
import { click, type Rendered, render, settle } from '../test/render'
import { downloadedFraction, standInTranslator } from '../test/translator-stand-in'
import { lineEnglish, watching } from '../test/video-tab-harness'
import { notReady } from '../test/word-cards'
import { translateLabels } from '../translate/labels'
import { onDeviceServices, type TranslateServices } from '../translate/services'
import { TranslateTab } from '../translate/translate-tab'
import {
  downloadTranslator,
  onDeviceTranslation,
  translatorAvailability
} from '../translation/translator'
import type { ReadData } from './dictionary-progress'
import { labels } from './labels'
import { recheckMs } from './translation-model'
import { Welcome } from './welcome'

const rendered: Rendered[] = []

let video: ReturnType<typeof watching> | undefined

beforeEach(() => {
  startExtension()
})

afterEach(() => {
  for (const page of rendered.splice(0)) page.unmount()
  video?.unmount()
  video = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const later = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

const dictionaryReady: ReadData = async () => ({
  type: 'state',
  data: { state: 'ready', release: '2026.10.1', bytes: 237_000_000, checkedAt: 1 }
})

function buttonIn(scope: ParentNode, name: string) {
  return [...scope.querySelectorAll('button')].find(button => button.textContent === name)
}

async function shown(node: Parameters<typeof render>[0]) {
  const page = render(node)
  rendered.push(page)
  await settle()
  return page.container
}

async function welcome() {
  const page = await shown(<Welcome read={dictionaryReady} />)
  return {
    unmount: () => rendered.pop()?.unmount(),
    text: () => page.textContent ?? '',
    notice: () =>
      page.querySelector('[data-translation-model]')?.getAttribute('data-translation-model'),
    download: () => buttonIn(page, labels.translation.download),
    progress: () => page.querySelector('progress')?.value
  }
}

describe('the welcome tab’s English translations', () => {
  it('offers Chrome’s Japanese download, starts it only from the click, then says translations are ready', async () => {
    const chrome = standInTranslator('downloadable')
    const page = await welcome()
    expect(page.notice()).toBe('downloadable')
    expect(page.text()).toContain(labels.progress.ready)
    expect(page.text()).toContain(labels.welcome.translationOffer)
    expect(chrome.Translator.create).not.toHaveBeenCalled()
    await click(page.download())
    expect(chrome.created()).toEqual(['ja-en'])
    expect(page.progress()).toBe(downloadedFraction)
    expect(page.text()).toContain(labels.translation.downloading(downloadedFraction))
    await act(async () => chrome.finishDownload())
    await settle()
    expect(page.notice()).toBe('available')
    expect(page.text()).toContain(labels.welcome.translationReady)
    expect(page.download()).toBeUndefined()
  })

  it('says Chrome is downloading, with no Download, and checks again every 2 seconds until Chrome has it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    const chrome = standInTranslator('downloading')
    const page = await welcome()
    expect(page.notice()).toBe('chrome-downloading')
    expect(page.text()).toContain(labels.translation.chromeDownloading)
    expect(page.text()).not.toContain(labels.welcome.translationOffer)
    expect(page.download()).toBeUndefined()
    const asked = chrome.Translator.availability.mock.calls.length
    await later(recheckMs - 100)
    expect(chrome.Translator.availability).toHaveBeenCalledTimes(asked)
    await later(100)
    expect(chrome.Translator.availability).toHaveBeenCalledTimes(asked + 1)
    expect(page.notice()).toBe('chrome-downloading')
    chrome.Translator.availability.mockResolvedValue('available')
    await later(recheckMs)
    expect(page.notice()).toBe('available')
    expect(page.text()).toContain(labels.welcome.translationReady)
    await later(recheckMs * 3)
    expect(chrome.Translator.availability).toHaveBeenCalledTimes(asked + 2)
    expect(chrome.Translator.create).not.toHaveBeenCalled()
  })

  it('offers Download again when Chrome’s download stops', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    const chrome = standInTranslator('downloading')
    const page = await welcome()
    chrome.Translator.availability.mockResolvedValue('downloadable')
    await later(recheckMs)
    expect(page.notice()).toBe('downloadable')
    expect(page.download()).toBeDefined()
  })

  it('stops checking once the tab closes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    const chrome = standInTranslator('downloading')
    const page = await welcome()
    const asked = chrome.Translator.availability.mock.calls.length
    page.unmount()
    await later(recheckMs * 3)
    expect(chrome.Translator.availability).toHaveBeenCalledTimes(asked)
  })

  it('says translations are ready, with no Download, when Chrome already has the model', async () => {
    const chrome = standInTranslator('available')
    const page = await welcome()
    expect(page.notice()).toBe('available')
    expect(page.text()).toContain(labels.welcome.translationReady)
    expect(page.download()).toBeUndefined()
    expect(chrome.Translator.create).not.toHaveBeenCalled()
  })

  it('says nothing about translations where Chrome can’t translate Japanese', async () => {
    standInTranslator('unavailable')
    const page = await welcome()
    expect(page.notice()).toBeUndefined()
    expect(page.text()).not.toContain(labels.welcome.translationOffer)
    expect(page.text()).not.toContain(labels.welcome.translationReady)
    expect(page.text()).not.toContain(translateLabels.notices.unavailable)
    expect(page.download()).toBeUndefined()
  })

  it('says nothing about translations in a Chrome with no Translator', async () => {
    const page = await welcome()
    expect(page.text()).toContain(labels.progress.ready)
    expect(page.notice()).toBeUndefined()
    expect(page.download()).toBeUndefined()
  })

  it('says the download didn’t finish, and Download starts it again', async () => {
    const chrome = standInTranslator('downloadable')
    const cancelled = new Error('The download was cancelled.')
    chrome.Translator.create.mockRejectedValueOnce(cancelled)
    const page = await welcome()
    await click(page.download())
    expect(page.notice()).toBe('download-failed')
    expect(page.text()).toContain(labels.translation.downloadFailed)
    await click(page.download())
    await act(async () => chrome.finishDownload())
    await settle()
    expect(page.text()).toContain(labels.welcome.translationReady)
  })
})

function watchForProgress(scope: Element) {
  let seen = false
  const observer = new MutationObserver(() => {
    if (scope.querySelector('progress')) seen = true
  })
  observer.observe(scope, { subtree: true, childList: true })
  return () => {
    observer.disconnect()
    return seen || scope.querySelector('progress') !== null
  }
}

async function typeInto(scope: Element, value: string) {
  const box = scope.querySelector('textarea') as HTMLTextAreaElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(box, value)
    box.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function translateServices() {
  return {
    ...onDeviceServices,
    translate: onDeviceTranslation(),
    download: vi.fn<TranslateServices['download']>(downloadTranslator),
    readSelection: async () => 'トイレはどこですか',
    localVoice: () => null,
    watchVoices: () => () => {},
    segment: async () => notReady
  } satisfies TranslateServices
}

describe('after the welcome tab’s download', () => {
  it('the Video tab and Translate translate both ways, and neither asks to download', async () => {
    const chrome = standInTranslator('downloadable', {
      ...lineEnglish,
      トイレはどこですか: 'Where is the toilet?',
      'Where is the station?': '駅はどこ?'
    })
    const page = await welcome()
    await click(page.download())
    await act(async () => chrome.finishDownload())
    await settle()
    expect(page.notice()).toBe('available')

    video = watching({
      translation: {
        translate: onDeviceTranslation(),
        availability: translatorAvailability,
        download: downloadTranslator
      }
    })
    await video.show(true)
    await video.lines()
    await vi.waitFor(() =>
      expect(video?.rows().map(row => row.querySelector('[data-english]')?.textContent)).toEqual(
        japaneseLines.map(line => lineEnglish[line])
      )
    )
    expect(video.panel.querySelector('[data-translation-model]')).toBeNull()
    expect(video.services.download).not.toHaveBeenCalled()

    const services = translateServices()
    const translate = await shown(<TranslateTab services={services} />)
    const progressShown = watchForProgress(translate)
    await click(buttonIn(translate, translateLabels.useSelection))
    await click(buttonIn(translate, translateLabels.translate))
    expect(translate.querySelector('[data-translation]')?.textContent).toBe('Where is the toilet?')
    expect(services.download).not.toHaveBeenCalled()

    await typeInto(translate, 'Where is the station?')
    await click(buttonIn(translate, translateLabels.translate))
    expect(translate.querySelector('[data-translation]')?.textContent).toBe('駅はどこ?')
    expect(services.download).toHaveBeenCalledOnce()
    expect(chrome.created().filter(made => made === 'en-ja')).toHaveLength(2)
    expect(progressShown()).toBe(false)
    expect(translate.querySelector('[data-notice]')).toBeNull()
    expect(buttonIn(translate, labels.translation.download)).toBeUndefined()
  })
})
