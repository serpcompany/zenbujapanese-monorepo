import { vi } from 'vitest'
import type { TranslatorState } from '../translation/messages'

type Languages = { sourceLanguage: string; targetLanguage: string }

type CreateOptions = Languages & { monitor?(monitor: EventTarget): void }

export const downloadedFraction = 0.42

const keyOf = ({ sourceLanguage, targetLanguage }: Languages) =>
  `${sourceLanguage}-${targetLanguage}`

export function standInTranslator(
  state: TranslatorState = 'available',
  phrasebook: Record<string, string> = {}
) {
  const states = new Map<string, TranslatorState>()
  const stateOf = (languages: Languages) => states.get(keyOf(languages)) ?? state
  let packIn = false
  let finishDownload = () => {}
  const downloaded = new Promise<void>(resolve => {
    finishDownload = resolve
  })
  const Translator = {
    availability: vi.fn(async (languages: Languages) => stateOf(languages)),
    create: vi.fn(async (options: CreateOptions) => {
      const current = stateOf(options)
      if (current === 'unavailable') throw new Error('Unavailable.')
      if (current !== 'available') {
        const progress = new EventTarget()
        options.monitor?.(progress)
        const report = (loaded: number) =>
          progress.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }))
        report(0)
        if (packIn) await new Promise(resolve => setTimeout(resolve, 0))
        else {
          report(downloadedFraction)
          await downloaded
          packIn = true
        }
        report(1)
        states.set(keyOf(options), 'available')
      }
      return { translate: async (text: string) => phrasebook[text] ?? '', destroy() {} }
    })
  }
  vi.stubGlobal('Translator', Translator)
  return {
    Translator,
    finishDownload: () => finishDownload(),
    created: () => Translator.create.mock.calls.map(([options]) => keyOf(options))
  }
}
