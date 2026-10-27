import { afterEach, describe, expect, it, vi } from 'vitest'
import { relayToWorker } from '../offscreen/relay'
import { answerTranslation } from '../offscreen/translation'
import { type TranslationRequest, type TranslatorState, translate } from '../translation/messages'
import { downloadTranslator, onDeviceTranslation } from '../translation/translator'
import { routeToOffscreen } from './router'
import { routeTranslation } from './translation'

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (answer: never) => void
) => boolean

type Options = {
  sourceLanguage: string
  targetLanguage: string
  signal?: AbortSignal
  monitor?(target: EventTarget): void
}

const japaneseToEnglish = { from: 'ja', to: 'en' } as const
const englishToJapanese = { from: 'en', to: 'ja' } as const

const phrasebook: Record<string, string> = {
  '駅まで歩いて何分ですか？': 'How many minutes does it take to walk to the station?',
  トイレはどこですか: 'Where is the toilet?',
  'Where can I buy a Suica card?': 'Suicaカードはどこで買えますか？'
}

const translating = (direction: TranslationRequest['direction'], ...texts: string[]) =>
  ({ type: 'translate', direction, texts }) as const

function standInTranslator(states: Record<string, TranslatorState> = {}) {
  const lines = vi.fn(async (text: string) => phrasebook[text] ?? '')
  const Translator = {
    availability: vi.fn(
      async ({ sourceLanguage, targetLanguage }: Options) =>
        states[`${sourceLanguage}-${targetLanguage}`] ?? 'available'
    ),
    create: vi.fn(async (_options: Options) => ({ translate: lines, destroy: vi.fn() }))
  }
  vi.stubGlobal('Translator', Translator)
  return { Translator, lines }
}

function runtimeFor(listeners: Listener[]) {
  return {
    sendMessage(message: unknown) {
      return new Promise<never>((answer, refuse) => {
        for (const listener of listeners) if (listener(message, {}, answer)) return
        refuse(new Error('Could not establish connection. Receiving end does not exist.'))
      })
    }
  }
}

function extension({ timeoutMs = 1_000, open = async () => {} } = {}) {
  const offscreen: Listener[] = []
  const toOffscreen = runtimeFor(offscreen)
  const offscreenDocument = {
    ensureOpen: vi.fn(async () => {
      await open()
      if (offscreen.length === 0)
        offscreen.push(answerTranslation(onDeviceTranslation(timeoutMs)) as Listener)
    })
  }
  const serviceWorker = [routeTranslation(offscreenDocument, toOffscreen) as Listener]
  return { contentScript: runtimeFor(serviceWorker), offscreenDocument }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('a content script translates through the service worker and the offscreen document', () => {
  it('gets a Japanese line back in English, the offscreen document opened first', async () => {
    standInTranslator()
    const { contentScript, offscreenDocument } = extension()
    await expect(
      translate(translating(japaneseToEnglish, '駅まで歩いて何分ですか？'), contentScript)
    ).resolves.toEqual({
      type: 'translated',
      texts: ['How many minutes does it take to walk to the station?']
    })
    expect(offscreenDocument.ensureOpen).toHaveBeenCalledOnce()
  })

  it('gets an English line back in Japanese', async () => {
    const { Translator } = standInTranslator()
    const { contentScript } = extension()
    await expect(
      translate(translating(englishToJapanese, 'Where can I buy a Suica card?'), contentScript)
    ).resolves.toEqual({ type: 'translated', texts: ['Suicaカードはどこで買えますか？'] })
    expect(Translator.create).toHaveBeenCalledWith({ sourceLanguage: 'en', targetLanguage: 'ja' })
  })

  it('keeps the order of several lines, and a blank line as it is, untranslated', async () => {
    const { lines } = standInTranslator()
    const { contentScript } = extension()
    await expect(
      translate(
        translating(japaneseToEnglish, 'トイレはどこですか', ' ', '駅まで歩いて何分ですか？'),
        contentScript
      )
    ).resolves.toEqual({
      type: 'translated',
      texts: ['Where is the toilet?', ' ', 'How many minutes does it take to walk to the station?']
    })
    expect(lines).toHaveBeenCalledTimes(2)
  })

  it('says how available the translator is for a direction', async () => {
    standInTranslator({ 'en-ja': 'downloadable' })
    const { contentScript } = extension()
    const availability = (direction: TranslationRequest['direction']) =>
      translate({ type: 'availability', direction }, contentScript)
    await expect(availability(japaneseToEnglish)).resolves.toEqual({
      type: 'availability',
      state: 'available'
    })
    await expect(availability(englishToJapanese)).resolves.toEqual({
      type: 'availability',
      state: 'downloadable'
    })
  })

  it('makes one translator for each direction and keeps it', async () => {
    const { Translator } = standInTranslator()
    const { contentScript } = extension()
    await translate(translating(japaneseToEnglish, 'トイレはどこですか'), contentScript)
    await translate(translating(japaneseToEnglish, '駅まで歩いて何分ですか？'), contentScript)
    await translate(translating(englishToJapanese, 'Where can I buy a Suica card?'), contentScript)
    expect(Translator.create).toHaveBeenCalledTimes(2)
  })

  it('makes one translator for two translations sent at once', async () => {
    const { Translator } = standInTranslator()
    const { contentScript } = extension()
    await Promise.all([
      translate(translating(japaneseToEnglish, 'トイレはどこですか'), contentScript),
      translate(translating(japaneseToEnglish, '駅まで歩いて何分ですか？'), contentScript)
    ])
    expect(Translator.create).toHaveBeenCalledOnce()
  })

  it.each([
    'downloadable',
    'downloading',
    'unavailable'
  ] as const)('answers not-available, and makes no translator, while the model is %s', async state => {
    const { Translator } = standInTranslator({ 'ja-en': state })
    const { contentScript } = extension()
    await expect(
      translate(translating(japaneseToEnglish, 'トイレはどこですか'), contentScript)
    ).resolves.toEqual({ type: 'not-available', state })
    expect(Translator.create).not.toHaveBeenCalled()
  })

  it('answers unavailable when the browser has no Translator', async () => {
    const { contentScript } = extension()
    await expect(
      translate(translating(japaneseToEnglish, 'トイレはどこですか'), contentScript)
    ).resolves.toEqual({ type: 'not-available', state: 'unavailable' })
    await expect(
      translate({ type: 'availability', direction: japaneseToEnglish }, contentScript)
    ).resolves.toEqual({ type: 'availability', state: 'unavailable' })
  })

  it('answers with a failure when translating fails, then makes a new translator', async () => {
    const { Translator, lines } = standInTranslator()
    lines.mockRejectedValueOnce(new Error('The translation failed.'))
    const { contentScript } = extension()
    const toilet = translating(japaneseToEnglish, 'トイレはどこですか')
    await expect(translate(toilet, contentScript)).resolves.toEqual({
      type: 'failed',
      reason: 'The translation failed.'
    })
    await expect(translate(toilet, contentScript)).resolves.toEqual({
      type: 'translated',
      texts: ['Where is the toilet?']
    })
    expect(Translator.create).toHaveBeenCalledTimes(2)
    const failed = await Translator.create.mock.results[0]?.value
    expect(failed?.destroy).toHaveBeenCalledOnce()
  })

  it.each([
    'translating',
    'making the translator'
  ] as const)('answers with a failure when %s does not finish in time, then makes a new translator', async stuckAt => {
    const { Translator, lines } = standInTranslator()
    if (stuckAt === 'translating') lines.mockReturnValueOnce(new Promise(() => {}))
    else Translator.create.mockReturnValueOnce(new Promise(() => {}))
    const { contentScript } = extension({ timeoutMs: 10 })
    const toilet = translating(japaneseToEnglish, 'トイレはどこですか')
    await expect(translate(toilet, contentScript)).resolves.toEqual({
      type: 'failed',
      reason: 'The translator did not answer.'
    })
    if (stuckAt === 'translating') {
      const stuck = await Translator.create.mock.results[0]?.value
      expect(stuck?.destroy).toHaveBeenCalledOnce()
    }
    await expect(translate(toilet, contentScript)).resolves.toEqual({
      type: 'translated',
      texts: ['Where is the toilet?']
    })
    expect(Translator.create).toHaveBeenCalledTimes(2)
  })

  it('answers with a failure when the offscreen document cannot open', async () => {
    standInTranslator()
    const { contentScript } = extension({
      open: () => Promise.reject(new Error('Only a single offscreen document may be created.'))
    })
    await expect(
      translate(translating(japaneseToEnglish, 'トイレはどこですか'), contentScript)
    ).resolves.toEqual({
      type: 'failed',
      reason: 'Only a single offscreen document may be created.'
    })
  })

  it('answers with a failure when sending throws, as it does once the extension reloads', async () => {
    const reloaded = {
      sendMessage: () => {
        throw new Error('Extension context invalidated.')
      }
    }
    await expect(
      translate(translating(japaneseToEnglish, 'トイレはどこですか'), reloaded)
    ).resolves.toEqual({ type: 'failed', reason: 'Extension context invalidated.' })
  })

  it('keeps its messages apart from the dictionary’s, and from the other part’s', () => {
    const sendResponse = vi.fn()
    const toilet = translating(japaneseToEnglish, 'トイレはどこですか')
    const serviceWorker = routeTranslation({ ensureOpen: vi.fn() }, runtimeFor([]))
    const offscreen = answerTranslation(vi.fn())
    const dictionaryRouter = routeToOffscreen({
      ensureOffscreenDocument: vi.fn(),
      offscreenDocumentStarted: vi.fn(),
      sendMessage: vi.fn()
    })
    const dictionaryRelay = relayToWorker(vi.fn())
    const ping = { type: 'ping' }
    expect(serviceWorker({ target: 'service-worker', request: ping }, {}, sendResponse)).toBe(false)
    expect(serviceWorker({ target: 'offscreen', translation: toilet }, {}, sendResponse)).toBe(
      false
    )
    expect(serviceWorker({ target: 'service-worker', translation: {} }, {}, sendResponse)).toBe(
      false
    )
    expect(offscreen({ target: 'offscreen', request: ping }, {}, sendResponse)).toBe(false)
    expect(offscreen({ target: 'service-worker', translation: toilet }, {}, sendResponse)).toBe(
      false
    )
    expect(offscreen('translate', {}, sendResponse)).toBe(false)
    expect(
      dictionaryRouter({ target: 'service-worker', translation: toilet }, {}, sendResponse)
    ).toBe(false)
    expect(dictionaryRelay({ target: 'offscreen', translation: toilet }, {}, sendResponse)).toBe(
      false
    )
    expect(sendResponse).not.toHaveBeenCalled()
  })
})

describe('downloadTranslator, which a page calls from a click', () => {
  it('reports the download’s progress and says the translator is available', async () => {
    const { Translator } = standInTranslator()
    Translator.create.mockImplementation(async options => {
      const monitor = new EventTarget()
      options.monitor?.(monitor)
      for (const loaded of [0, 0.5, 1])
        monitor.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }))
      return { translate: vi.fn(), destroy: vi.fn() }
    })
    const progress = vi.fn()
    await expect(downloadTranslator(japaneseToEnglish, progress)).resolves.toBe('available')
    expect(progress.mock.calls).toEqual([[0], [0.5], [1]])
  })

  it('says the translator’s state when the download does not finish', async () => {
    const { Translator } = standInTranslator({ 'ja-en': 'downloadable' })
    Translator.create.mockRejectedValue(new Error('The download was cancelled.'))
    await expect(downloadTranslator(japaneseToEnglish, vi.fn())).resolves.toBe('downloadable')
  })

  it('says unavailable when the browser has no Translator', async () => {
    await expect(downloadTranslator(japaneseToEnglish, vi.fn())).resolves.toBe('unavailable')
  })

  it('gives up on a download that makes no progress for a minute, and stops it', async () => {
    vi.useFakeTimers()
    const { Translator } = standInTranslator({ 'ja-en': 'downloading' })
    let progressed = (_loaded: number) => {}
    let signal: AbortSignal | undefined
    Translator.create.mockImplementation(options => {
      const monitor = new EventTarget()
      options.monitor?.(monitor)
      signal = options.signal
      progressed = loaded =>
        monitor.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }))
      return new Promise(() => {})
    })
    const progress = vi.fn()
    let state: TranslatorState | undefined
    downloadTranslator(japaneseToEnglish, progress).then(answer => (state = answer))
    await vi.advanceTimersByTimeAsync(59_000)
    progressed(0.3)
    await vi.advanceTimersByTimeAsync(59_000)
    expect(state).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(state).toBe('downloading')
    expect(signal?.aborted).toBe(true)
    expect(progress.mock.calls).toEqual([[0.3]])
  })
})
