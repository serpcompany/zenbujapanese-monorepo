import { act, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Failure } from '../shared/messages'
import type { PanelTabProps } from '../side-panel/route'
import { startExtension } from '../test/extension'
import { click, find, settle } from '../test/render'
import { notReady, popupAnswer, sentence, sentenceAnswer } from '../test/word-cards'
import type { TranslationAnswer, TranslatorState } from '../translation/messages'
import {
  downloadTranslator,
  onDeviceTranslation,
  translatorAvailability
} from '../translation/translator'
import { wordPopupLabels } from '../word-popup/labels'
import { translateLabels } from './labels'
import type { TranslateServices } from './services'
import { TranslateTab } from './translate-tab'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const phrasebook: Record<string, string> = {
  '駅まで歩いて何分ですか？': 'How many minutes does it take to walk to the station?',
  トイレはどこですか: 'Where is the toilet?',
  'Where can I buy a Suica card?': 'Suicaカードはどこで買えますか？',
  [sentence]: 'A demand is needed.'
}

type CreateOptions = { monitor?(monitor: EventTarget): void }

function standInTranslator(state: TranslatorState = 'available') {
  let current = state
  let finishDownload = () => {}
  const downloaded = new Promise<void>(resolve => {
    finishDownload = resolve
  })
  const Translator = {
    availability: vi.fn(async () => current),
    create: vi.fn(async ({ monitor }: CreateOptions) => {
      if (current === 'unavailable') throw new Error('Unavailable.')
      if (current !== 'available') {
        const progress = new EventTarget()
        monitor?.(progress)
        progress.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: 0.42 }))
        await downloaded
        current = 'available'
      }
      return { translate: async (text: string) => phrasebook[text] ?? '', destroy() {} }
    })
  }
  vi.stubGlobal('Translator', Translator)
  return { Translator, finishDownload: () => finishDownload() }
}

function servicesWith(selection: string | null = '') {
  const translateOnDevice = onDeviceTranslation()
  return {
    translate: vi.fn<TranslateServices['translate']>(request => translateOnDevice(request)),
    availability: vi.fn<TranslateServices['availability']>(translatorAvailability),
    download: vi.fn<TranslateServices['download']>(downloadTranslator),
    readSelection: vi.fn(async () => selection),
    copy: vi.fn(async (_text: string) => {}),
    localVoice: vi.fn<TranslateServices['localVoice']>(() => 'Kyoko'),
    watchVoices: vi.fn(() => () => {}),
    speak: vi.fn(),
    segment: vi.fn<TranslateServices['segment']>(async () => notReady),
    wait: vi.fn<TranslateServices['wait']>(() => new Promise(() => {})),
    popupCard: vi.fn<TranslateServices['popupCard']>(async id => popupAnswer(id))
  } satisfies TranslateServices
}

const unmounts: (() => void)[] = []

beforeEach(() => {
  startExtension()
})

afterEach(() => {
  for (const unmount of unmounts.splice(0)) act(unmount)
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

async function showTab(services: TranslateServices, open = vi.fn()) {
  const panel = document.body.appendChild(document.createElement('main'))
  const root = createRoot(panel)
  unmounts.push(() => root.unmount())
  await act(async () => root.render(<TranslateTab services={services} open={open} />))
  const button = (name: string) =>
    [...panel.querySelectorAll('button')].find(found => found.textContent === name) as
      | HTMLButtonElement
      | undefined
  const box = () => panel.querySelector('textarea') as HTMLTextAreaElement
  return {
    box,
    card: () => panel.querySelector('[data-translation-card]'),
    text: (selector: string) => panel.querySelector(selector)?.textContent,
    notice: () => panel.querySelector('[data-notice]')?.textContent,
    progress: () => panel.querySelector('progress'),
    click: (name: string) => act(async () => button(name)?.click()),
    button,
    type: (value: string) =>
      act(async () => {
        const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
        setValue?.set?.call(box(), value)
        box().dispatchEvent(new Event('input', { bubbles: true }))
      })
  }
}

describe('the Translate tab', () => {
  it('fits the side panel’s tab contract', () => {
    const content: ComponentType<PanelTabProps> = TranslateTab
    expect(content).toBe(TranslateTab)
  })

  it('takes in the selection with Use Selection and translates it from Japanese to English', async () => {
    standInTranslator()
    const services = servicesWith('駅まで歩いて何分ですか？')
    const tab = await showTab(services)
    await tab.click(translateLabels.useSelection)
    expect(tab.box().value).toBe('駅まで歩いて何分ですか？')
    await tab.click(translateLabels.translate)
    expect(tab.text('[data-direction]')).toBe('Japanese → English')
    expect(tab.text('[data-source]')).toBe('駅まで歩いて何分ですか？')
    expect(tab.text('[data-translation]')).toBe(
      'How many minutes does it take to walk to the station?'
    )
    expect(tab.card()?.textContent).toContain(translateLabels.onThisDevice)
  })

  it('links the words of a Japanese source to the word popup, and its Open Full Entry to Word Detail', async () => {
    standInTranslator()
    const services = servicesWith()
    services.segment.mockImplementation(async () => sentenceAnswer)
    const open = vi.fn()
    const tab = await showTab(services, open)
    await tab.type(sentence)
    await tab.click(translateLabels.translate)
    await settle()
    await click(find(document, '[data-source] [data-word="要求"]'))
    await tab.click(wordPopupLabels.openFullEntry)
    expect(open).toHaveBeenCalledWith({ page: 'word', entSeq: 1546680 })
    expect(services.segment).toHaveBeenCalledWith(sentence)
  })

  it('translates English typed in the box to Japanese', async () => {
    standInTranslator()
    const tab = await showTab(servicesWith())
    await tab.type('Where can I buy a Suica card?')
    await tab.click(translateLabels.translate)
    expect(tab.text('[data-direction]')).toBe('English → Japanese')
    expect(tab.text('[data-translation]')).toBe('Suicaカードはどこで買えますか？')
    expect(tab.card()?.querySelector('[data-translation]')?.getAttribute('lang')).toBe('ja')
  })

  it('copies the translation, and says so', async () => {
    standInTranslator()
    const services = servicesWith()
    const tab = await showTab(services)
    await tab.type('トイレはどこですか')
    await tab.click(translateLabels.translate)
    await tab.click(translateLabels.copy)
    expect(services.copy).toHaveBeenCalledWith('Where is the toilet?')
    expect(tab.button(translateLabels.copied)).toBeDefined()
  })

  it('speaks the translation in its own language', async () => {
    standInTranslator()
    const services = servicesWith()
    const tab = await showTab(services)
    await tab.type('トイレはどこですか')
    await tab.click(translateLabels.translate)
    await tab.click(translateLabels.speak)
    expect(services.speak).toHaveBeenCalledWith('Where is the toilet?', 'en')
    expect(tab.text('[data-no-voice]')).toBeUndefined()
  })

  it('turns Speak off, and says why, when no voice on this computer speaks the language', async () => {
    standInTranslator()
    const services = servicesWith()
    services.localVoice.mockReturnValue(null)
    const tab = await showTab(services)
    await tab.type('トイレはどこですか')
    await tab.click(translateLabels.translate)
    expect(services.localVoice).toHaveBeenCalledWith('en')
    expect(tab.button(translateLabels.speak)?.disabled).toBe(true)
    expect(tab.text('[data-no-voice]')).toBe(
      "There's no English voice on this computer to speak it."
    )
  })

  it('downloads the model from the click, showing its progress, then shows the translation', async () => {
    const { Translator, finishDownload } = standInTranslator('downloadable')
    const services = servicesWith()
    const tab = await showTab(services)
    await tab.type('トイレはどこですか')
    await tab.click(translateLabels.translate)
    expect(tab.notice()).toBeUndefined()
    expect(tab.progress()?.value).toBe(0.42)
    expect(tab.button(translateLabels.translate)?.disabled).toBe(true)
    expect(tab.card()).toBeNull()
    expect(services.download).toHaveBeenCalledOnce()
    expect(services.translate).not.toHaveBeenCalled()
    await act(async () => finishDownload())
    expect(tab.progress()).toBeNull()
    expect(tab.text('[data-translation]')).toBe('Where is the toilet?')
    expect(services.translate).toHaveBeenCalledOnce()
    expect(Translator.create).toHaveBeenCalledTimes(2)
  })

  it('says Translate isn’t available on this computer, and translates nothing', async () => {
    const { Translator } = standInTranslator('unavailable')
    const services = servicesWith()
    const tab = await showTab(services)
    await tab.type('トイレはどこですか')
    await tab.click(translateLabels.translate)
    expect(tab.notice()).toBe("Translate isn't available on this computer.")
    expect(tab.card()).toBeNull()
    expect(services.download).not.toHaveBeenCalled()
    expect(Translator.create).not.toHaveBeenCalled()
  })

  it.each([
    'downloadable',
    'downloading'
  ] as const)('says the download didn’t finish, and lets it be tried again, when the model stays %s', async state => {
    standInTranslator(state)
    const services = servicesWith()
    services.download.mockResolvedValue(state)
    const tab = await showTab(services)
    await tab.type('トイレはどこですか')
    await tab.click(translateLabels.translate)
    expect(tab.notice()).toBe(translateLabels.notices.downloadFailed)
    expect(tab.button(translateLabels.translate)?.disabled).toBe(false)
    expect(services.translate).not.toHaveBeenCalled()
  })

  it('removes the result on Clear, and empties the box', async () => {
    standInTranslator()
    const tab = await showTab(servicesWith())
    await tab.type('トイレはどこですか')
    await tab.click(translateLabels.translate)
    expect(tab.card()).not.toBeNull()
    await tab.click(translateLabels.clear)
    expect(tab.card()).toBeNull()
    expect(tab.box().value).toBe('')
  })

  it('removes the result when the box is emptied', async () => {
    standInTranslator()
    const tab = await showTab(servicesWith())
    await tab.type('トイレはどこですか')
    await tab.click(translateLabels.translate)
    await tab.type('  ')
    expect(tab.card()).toBeNull()
  })

  it('replaces the last result with the new one', async () => {
    standInTranslator()
    const tab = await showTab(servicesWith())
    await tab.type('トイレはどこですか')
    await tab.click(translateLabels.translate)
    await tab.type('Where can I buy a Suica card?')
    await tab.click(translateLabels.translate)
    expect(document.querySelectorAll('[data-translation-card]')).toHaveLength(1)
    expect(tab.text('[data-translation]')).toBe('Suicaカードはどこで買えますか？')
  })

  it('drops an answer that comes after Clear', async () => {
    standInTranslator()
    const services = servicesWith()
    let answer = (_answer: TranslationAnswer | Failure) => {}
    services.translate.mockReturnValue(new Promise(resolve => (answer = resolve)))
    const tab = await showTab(services)
    await tab.type('トイレはどこですか')
    await tab.click(translateLabels.translate)
    await tab.click(translateLabels.clear)
    await act(async () => answer({ type: 'translated', texts: ['Where is the toilet?'] }))
    expect(tab.card()).toBeNull()
  })

  it.each([
    ['', translateLabels.notices.nothingSelected],
    [null, translateLabels.notices.selectionUnreadable]
  ])('keeps the box as it was when the selection is %j, and says why', async (selection, said) => {
    standInTranslator()
    const tab = await showTab(servicesWith(selection))
    await tab.type('トイレはどこですか')
    await tab.click(translateLabels.useSelection)
    expect(tab.notice()).toBe(said)
    expect(tab.box().value).toBe('トイレはどこですか')
  })

  it('asks for Japanese or English when the text is neither, and sends nothing', async () => {
    const services = servicesWith()
    const tab = await showTab(services)
    await tab.type('123 ！')
    await tab.click(translateLabels.translate)
    expect(tab.notice()).toBe(translateLabels.notices.noLanguage)
    expect(services.translate).not.toHaveBeenCalled()
  })

  it('says Translate didn’t answer when the answer is a failure', async () => {
    const services = servicesWith()
    services.translate.mockResolvedValue({
      type: 'failed',
      reason: 'The translator did not answer.'
    })
    const tab = await showTab(services)
    await tab.type('トイレはどこですか')
    await tab.click(translateLabels.translate)
    expect(tab.notice()).toBe(translateLabels.notices.failed)
  })
})
