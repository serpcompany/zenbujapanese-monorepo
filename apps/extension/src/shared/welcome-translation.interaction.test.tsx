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

  it('offers it too while Chrome is already downloading, and follows that download from the click', async () => {
    const chrome = standInTranslator('downloading')
    const page = await welcome()
    expect(page.text()).toContain(labels.welcome.translationOffer)
    expect(chrome.Translator.create).not.toHaveBeenCalled()
    await click(page.download())
    expect(page.progress()).toBe(downloadedFraction)
    await act(async () => chrome.finishDownload())
    await settle()
    expect(page.text()).toContain(labels.welcome.translationReady)
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
  it('the Video tab and Translate translate, and neither asks to download', async () => {
    const chrome = standInTranslator('downloadable', {
      ...lineEnglish,
      トイレはどこですか: 'Where is the toilet?'
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
    await click(buttonIn(translate, translateLabels.useSelection))
    await click(buttonIn(translate, translateLabels.translate))
    expect(translate.querySelector('[data-translation]')?.textContent).toBe('Where is the toilet?')
    expect(translate.querySelector('progress')).toBeNull()
    expect(services.download).not.toHaveBeenCalled()
  })
})
