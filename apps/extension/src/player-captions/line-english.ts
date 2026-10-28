import { useEffect, useReducer } from 'react'
import type { Failure } from '../shared/messages'
import type { Direction, TranslationAnswer, TranslationRequest } from '../translation/messages'

export type Translate = (request: TranslationRequest) => Promise<TranslationAnswer | Failure>

export type LineEnglish = {
  known(text: string): string | undefined
  ask(text: string): Promise<boolean>
}

const japaneseToEnglish: Direction = { from: 'ja', to: 'en' }

export function lineEnglish(translate: Translate): LineEnglish {
  const known = new Map<string, string>()
  const asking = new Map<string, Promise<boolean>>()
  return {
    known: text => known.get(text),
    ask(text) {
      if (known.has(text)) return Promise.resolve(false)
      const pending = asking.get(text)
      if (pending) return pending
      const asked = Promise.resolve()
        .then(() => translate({ type: 'translate', direction: japaneseToEnglish, texts: [text] }))
        .then(
          answer => {
            const english = answer.type === 'translated' ? answer.texts[0] : undefined
            if (!english) return false
            known.set(text, english)
            return true
          },
          () => false
        )
        .finally(() => asking.delete(text))
      asking.set(text, asked)
      return asked
    }
  }
}

export function useLineEnglish(
  english: LineEnglish,
  text: string | null,
  next: string | null,
  on: boolean
): string | undefined {
  const [, redraw] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    if (!on || text === null) return
    let live = true
    english.ask(text).then(found => {
      if (live && found) redraw()
    })
    if (next !== null) english.ask(next)
    return () => {
      live = false
    }
  }, [english, text, next, on])
  return on && text !== null ? english.known(text) : undefined
}
