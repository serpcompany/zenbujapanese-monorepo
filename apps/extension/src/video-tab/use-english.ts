import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { failure } from '../shared/messages'
import {
  type ModelServices,
  type ModelState,
  modelIn,
  useTranslationModel
} from '../shared/translation-model'
import { japaneseToEnglish } from '../translation/direction'
import type { VideoTabServices } from './services'

type EnglishServices = Pick<VideoTabServices, 'translate' | 'availability' | 'download'>

const translatingAtOnce = 2

function useTranslator(on: boolean, services: EnglishServices) {
  const model = useMemo<ModelServices>(
    () => ({
      availability: () => services.availability(japaneseToEnglish),
      download: onProgress => services.download(japaneseToEnglish, onProgress)
    }),
    [services]
  )
  const { model: translator, setModel: setTranslator, download } = useTranslationModel(on, model)
  return { translator, setTranslator, download }
}

export type English = {
  translating: boolean
  english: ReadonlyMap<string, string>
  failed: ReadonlySet<string>
  translator: ModelState
  download(): void
  retry(text: string): void
}

export function useEnglish(
  lines: readonly Caption[],
  on: boolean,
  services: EnglishServices
): English {
  const translating = on && lines.some(line => !line.translation)
  const { translator, setTranslator, download } = useTranslator(translating, services)
  const known = useRef(new Map<string, string>())
  const failed = useRef(new Set<string>())
  const mounted = useRef(false)
  const [, redraw] = useReducer((count: number) => count + 1, 0)
  const ready = translating && translator.state === 'available'
  const own = useMemo(
    () => new Map(lines.flatMap(line => (line.translation ? [[line.text, line.translation]] : []))),
    [lines]
  )

  const translateLine = useCallback(
    async (text: string): Promise<boolean> => {
      failed.current.delete(text)
      const answer = await services
        .translate({ type: 'translate', direction: japaneseToEnglish, texts: [text] })
        .catch((error: unknown) => failure(error))
      if (!mounted.current) return false
      if (answer.type === 'not-available') {
        setTranslator(modelIn(answer.state))
        return false
      }
      if (answer.type === 'translated' && answer.texts[0]) known.current.set(text, answer.texts[0])
      if (answer.type === 'failed') failed.current.add(text)
      redraw()
      return true
    },
    [services, setTranslator]
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    let live = true
    const waiting = [...new Set(lines.map(line => line.text))].filter(
      text => !known.current.has(text) && !own.has(text)
    )
    const translateNext = async (): Promise<void> => {
      const text = waiting.shift()
      if (!live || text === undefined) return
      if (!(await translateLine(text))) {
        live = false
        return
      }
      return translateNext()
    }
    for (let started = 0; started < translatingAtOnce; started += 1) translateNext()
    return () => {
      live = false
    }
  }, [ready, lines, own, translateLine])

  const retry = useCallback(
    (text: string) => {
      translateLine(text)
      redraw()
    },
    [translateLine]
  )
  const english = own.size > 0 ? new Map([...known.current, ...own]) : known.current
  return { translating, english, failed: failed.current, translator, download, retry }
}
