import { useCallback, useRef, useState } from 'react'
import type { Failure } from '../shared/messages'
import { directionOf } from '../translation/direction'
import type {
  Direction,
  TranslationAnswer,
  TranslationRequest,
  TranslatorState
} from '../translation/messages'
import type { translateLabels } from './labels'
import type { TranslateServices } from './services'
import type { Translated } from './translation-card'

export type Notice = keyof typeof translateLabels.notices

export type Result =
  | { state: 'none' }
  | { state: 'translating' }
  | { state: 'downloading'; fraction: number }
  | { state: 'translated'; id: number; translated: Translated }
  | { state: 'notice'; notice: Notice }

const none: Result = { state: 'none' }

const noticeFor = (state: Exclude<TranslatorState, 'available'>): Result => ({
  state: 'notice',
  notice: state === 'unavailable' ? 'unavailable' : 'downloadFailed'
})

function resultOf(
  answer: TranslationAnswer | Failure,
  id: number,
  source: string,
  direction: Direction
): Result {
  switch (answer.type) {
    case 'translated':
      return {
        state: 'translated',
        id,
        translated: { source, translation: answer.texts.join('\n'), direction }
      }
    case 'not-available':
      return noticeFor(answer.state)
    default:
      return { state: 'notice', notice: 'failed' }
  }
}

export function useTranslation(
  services: Pick<TranslateServices, 'translate' | 'availability' | 'download'>
) {
  const [result, setResult] = useState<Result>(none)
  const latest = useRef(0)

  const clear = useCallback(() => {
    latest.current += 1
    setResult(none)
  }, [])

  const translate = useCallback(
    async (text: string) => {
      latest.current += 1
      const id = latest.current
      const isLatest = () => id === latest.current
      const show = (next: Result) => {
        if (isLatest()) setResult(next)
      }
      const source = text.trim()
      const direction = directionOf(source)
      if (!direction) return show({ state: 'notice', notice: 'noLanguage' })
      show({ state: 'translating' })
      const request: TranslationRequest = { type: 'translate', direction, texts: [source] }
      const here = await services.availability(direction).catch(() => null)
      if (here === 'downloadable' || here === 'downloading') {
        show({ state: 'downloading', fraction: 0 })
        const downloaded = await services
          .download(direction, fraction => show({ state: 'downloading', fraction }))
          .catch(() => null)
        if (downloaded === null) return show({ state: 'notice', notice: 'failed' })
        if (downloaded !== 'available') return show(noticeFor(downloaded))
      }
      show(resultOf(await services.translate(request), id, source, direction))
    },
    [services]
  )

  return { result, translate, clear }
}
