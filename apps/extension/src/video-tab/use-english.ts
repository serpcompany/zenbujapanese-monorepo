import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { failure } from '../shared/messages'
import type { Direction, TranslatorState } from '../translation/messages'
import type { VideoTabServices } from './services'

export type Translator =
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'downloadable' }
  | { state: 'downloading'; fraction: number }
  | { state: 'download-failed' }
  | { state: 'unavailable' }

type EnglishServices = Pick<VideoTabServices, 'translate' | 'availability' | 'download'>

const japaneseToEnglish: Direction = { from: 'ja', to: 'en' }

const translatingAtOnce = 2

const checking: Translator = { state: 'checking' }

function translatorIn(state: TranslatorState): Translator {
  if (state === 'available') return { state: 'available' }
  if (state === 'unavailable') return { state: 'unavailable' }
  return { state: 'downloadable' }
}

function afterDownload(state: TranslatorState): Translator {
  if (state === 'available' || state === 'unavailable') return translatorIn(state)
  return { state: 'download-failed' }
}

function useTranslator(on: boolean, services: EnglishServices) {
  const [translator, setTranslator] = useState<Translator>(checking)
  useEffect(() => {
    if (!on) return
    let live = true
    Promise.resolve()
      .then(() => services.availability(japaneseToEnglish))
      .then(translatorIn, (): Translator => ({ state: 'unavailable' }))
      .then(next => {
        if (live) setTranslator(next)
      })
    return () => {
      live = false
    }
  }, [on, services])
  const download = useCallback(() => {
    setTranslator({ state: 'downloading', fraction: 0 })
    Promise.resolve()
      .then(() =>
        services.download(japaneseToEnglish, fraction =>
          setTranslator({ state: 'downloading', fraction })
        )
      )
      .then(afterDownload, (): Translator => ({ state: 'download-failed' }))
      .then(setTranslator)
  }, [services])
  return { translator, setTranslator, download }
}

export function useEnglish(
  lines: readonly Caption[],
  on: boolean,
  services: EnglishServices
): { english: ReadonlyMap<string, string>; translator: Translator; download(): void } {
  const { translator, setTranslator, download } = useTranslator(on, services)
  const known = useRef(new Map<string, string>())
  const [, redraw] = useReducer((count: number) => count + 1, 0)
  const ready = on && translator.state === 'available'
  useEffect(() => {
    if (!ready) return
    let live = true
    const waiting = [...new Set(lines.map(line => line.text))].filter(
      text => !known.current.has(text)
    )
    const translateNext = async (): Promise<void> => {
      const text = waiting.shift()
      if (!live || text === undefined) return
      const answer = await services
        .translate({ type: 'translate', direction: japaneseToEnglish, texts: [text] })
        .catch((error: unknown) => failure(error))
      if (!live) return
      if (answer.type === 'not-available') {
        live = false
        return setTranslator(translatorIn(answer.state))
      }
      if (answer.type === 'translated' && answer.texts[0]) {
        known.current.set(text, answer.texts[0])
        redraw()
      }
      return translateNext()
    }
    for (let started = 0; started < translatingAtOnce; started += 1) translateNext()
    return () => {
      live = false
    }
  }, [ready, lines, services, setTranslator])
  return { english: known.current, translator, download }
}
