import type {
  Direction,
  Language,
  TranslationAnswer,
  TranslationRequest,
  TranslatorState
} from './messages'

type TranslatorOptions = {
  sourceLanguage: Language
  targetLanguage: Language
  signal?: AbortSignal
  monitor?(monitor: EventTarget): void
}

type OnDeviceTranslator = { translate(text: string): Promise<string>; destroy(): void }

type NotAvailable = Exclude<TranslatorState, 'available'>

type TranslatorAPI = {
  availability(options: TranslatorOptions): Promise<TranslatorState>
  create(options: TranslatorOptions): Promise<OnDeviceTranslator>
}

const translationTimeoutMs = 30_000

const downloadStallMs = 60_000

const chromeTranslator = (): TranslatorAPI | undefined =>
  (globalThis as { Translator?: TranslatorAPI }).Translator

const languagesOf = ({ from, to }: Direction) => ({ sourceLanguage: from, targetLanguage: to })

const keyOf = ({ from, to }: Direction) => `${from}-${to}`

const destroyWhenMade = (made: Promise<OnDeviceTranslator>) =>
  made.then(
    translator => translator.destroy(),
    () => undefined
  )

function withinTime<T>(answer: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('The translator did not answer.')), timeoutMs)
  })
  return Promise.race([answer, late]).finally(() => clearTimeout(timer))
}

function stallLimit(stallMs: number) {
  const stall = new AbortController()
  const stalled = new Promise<never>((_resolve, reject) => {
    stall.signal.addEventListener('abort', () => reject(stall.signal.reason))
  })
  const start = () =>
    setTimeout(() => stall.abort(new Error('The download stopped making progress.')), stallMs)
  let timer = start()
  return {
    signal: stall.signal,
    stalled,
    progressed() {
      clearTimeout(timer)
      timer = start()
    },
    stop: () => clearTimeout(timer)
  }
}

export async function translatorAvailability(direction: Direction): Promise<TranslatorState> {
  const translator = chromeTranslator()
  if (!translator) return 'unavailable'
  return translator.availability(languagesOf(direction))
}

export async function downloadTranslator(
  direction: Direction,
  onProgress: (fraction: number) => void,
  stallMs = downloadStallMs
): Promise<TranslatorState> {
  const translator = chromeTranslator()
  if (!translator) return 'unavailable'
  const limit = stallLimit(stallMs)
  const creating = translator.create({
    ...languagesOf(direction),
    signal: limit.signal,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', event => {
        limit.progressed()
        onProgress((event as ProgressEvent).loaded)
      })
    }
  })
  try {
    const created = await Promise.race([creating, limit.stalled])
    created.destroy()
    return 'available'
  } catch {
    destroyWhenMade(creating)
    return translatorAvailability(direction)
  } finally {
    limit.stop()
  }
}

export function onDeviceTranslation(
  timeoutMs = translationTimeoutMs
): (request: TranslationRequest) => Promise<TranslationAnswer> {
  const created = new Map<string, Promise<OnDeviceTranslator>>()

  function drop(direction: Direction) {
    const kept = created.get(keyOf(direction))
    if (!kept) return
    created.delete(keyOf(direction))
    destroyWhenMade(kept)
  }

  async function translatorFor(direction: Direction): Promise<OnDeviceTranslator | NotAvailable> {
    const kept = created.get(keyOf(direction))
    if (kept) return kept
    const translator = chromeTranslator()
    if (!translator) return 'unavailable'
    const state = await translator.availability(languagesOf(direction))
    if (state !== 'available') return state
    const madeMeanwhile = created.get(keyOf(direction))
    if (madeMeanwhile) return madeMeanwhile
    const creating = translator.create(languagesOf(direction))
    created.set(keyOf(direction), creating)
    creating.catch(() => {
      if (created.get(keyOf(direction)) === creating) created.delete(keyOf(direction))
    })
    return creating
  }

  async function translateWith(direction: Direction, texts: string[]): Promise<TranslationAnswer> {
    const translator = await translatorFor(direction)
    if (typeof translator === 'string') return { type: 'not-available', state: translator }
    const translated = await Promise.all(
      texts.map(text => (text.trim() === '' ? text : translator.translate(text)))
    )
    return { type: 'translated', texts: translated }
  }

  async function translateTexts(direction: Direction, texts: string[]): Promise<TranslationAnswer> {
    try {
      return await withinTime(translateWith(direction, texts), timeoutMs)
    } catch (error) {
      drop(direction)
      throw error
    }
  }

  return async request => {
    switch (request.type) {
      case 'availability':
        return {
          type: 'availability',
          state: await withinTime(translatorAvailability(request.direction), timeoutMs)
        }
      case 'translate':
        return translateTexts(request.direction, request.texts)
      default:
        throw new Error('The translator does not know this request.')
    }
  }
}
