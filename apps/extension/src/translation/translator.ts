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
  monitor?(monitor: EventTarget): void
}

type OnDeviceTranslator = { translate(text: string): Promise<string>; destroy(): void }

type NotAvailable = Exclude<TranslatorState, 'available'>

type TranslatorAPI = {
  availability(options: TranslatorOptions): Promise<TranslatorState>
  create(options: TranslatorOptions): Promise<OnDeviceTranslator>
}

const chromeTranslator = (): TranslatorAPI | undefined =>
  (globalThis as { Translator?: TranslatorAPI }).Translator

const languagesOf = ({ from, to }: Direction) => ({ sourceLanguage: from, targetLanguage: to })

const keyOf = ({ from, to }: Direction) => `${from}-${to}`

async function stateOf(direction: Direction): Promise<TranslatorState> {
  const translator = chromeTranslator()
  if (!translator) return 'unavailable'
  return translator.availability(languagesOf(direction))
}

export async function downloadTranslator(
  direction: Direction,
  onProgress: (fraction: number) => void
): Promise<TranslatorState> {
  const translator = chromeTranslator()
  if (!translator) return 'unavailable'
  try {
    const created = await translator.create({
      ...languagesOf(direction),
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', event =>
          onProgress((event as ProgressEvent).loaded)
        )
      }
    })
    created.destroy()
    return 'available'
  } catch {
    return stateOf(direction)
  }
}

export function onDeviceTranslation(): (request: TranslationRequest) => Promise<TranslationAnswer> {
  const created = new Map<string, Promise<OnDeviceTranslator>>()

  function forget(direction: Direction) {
    created.delete(keyOf(direction))
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
    creating.catch(() => forget(direction))
    return creating
  }

  async function translateTexts(direction: Direction, texts: string[]): Promise<TranslationAnswer> {
    const translator = await translatorFor(direction)
    if (typeof translator === 'string') return { type: 'not-available', state: translator }
    try {
      const translated = await Promise.all(
        texts.map(text => (text.trim() === '' ? text : translator.translate(text)))
      )
      return { type: 'translated', texts: translated }
    } catch (error) {
      forget(direction)
      throw error
    }
  }

  return async request => {
    switch (request.type) {
      case 'availability':
        return { type: 'availability', state: await stateOf(request.direction) }
      case 'translate':
        return translateTexts(request.direction, request.texts)
      default:
        throw new Error('The translator does not know this request.')
    }
  }
}
