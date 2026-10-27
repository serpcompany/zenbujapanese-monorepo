import { useCallback, useEffect, useRef, useState } from 'react'
import type { DataState } from '../shared/data-state'
import {
  type Lookup,
  lookUpFormExamples,
  lookUpKanji,
  lookUpWord,
  lookUpWordExamples,
  type NotReady,
  resolveWord
} from '../shared/dictionary'
import { useDataState } from '../shared/dictionary-progress'
import type { Failure } from '../shared/messages'

export const dictionaryLookups = {
  lookUpWord,
  lookUpKanji,
  lookUpWordExamples,
  lookUpFormExamples,
  resolveWord
}

export type WordLookups = typeof dictionaryLookups

export type Looked<T> =
  | { state: 'looking' }
  | { state: 'not-ready'; data: DataState }
  | { state: 'failed' }
  | { state: 'answered'; answer: T }

export type Unanswered = Exclude<Looked<unknown>, { state: 'answered' }>

type Answer = { type: string }

function isNotReady(answer: Answer): answer is NotReady {
  return answer.type === 'not-ready'
}

function isFailure(answer: Answer): answer is Failure {
  return answer.type === 'failed'
}

function looked<T extends Answer>(answer: T | NotReady | Failure): Looked<T> {
  if (isNotReady(answer)) return { state: 'not-ready', data: answer.data }
  if (isFailure(answer)) return { state: 'failed' }
  return { state: 'answered', answer: answer as T }
}

export async function answered<T extends Answer>(lookup: Lookup<T>): Promise<T | null> {
  try {
    const result = looked(await lookup)
    return result.state === 'answered' ? result.answer : null
  } catch {
    return null
  }
}

function waitsForData<T>(result: Looked<T>, answerWaits?: (answer: T) => boolean) {
  if (result.state === 'answered') return answerWaits?.(result.answer) ?? false
  return result.state !== 'failed'
}

export function useLookup<T extends Answer>(
  lookup: () => Lookup<T>,
  answerWaits?: (answer: T) => boolean
): [Looked<T>, () => void] {
  const [result, setResult] = useState<Looked<T>>({ state: 'looking' })
  const [data] = useDataState()
  const latest = useRef(0)
  const seen = useRef(data)
  const run = useCallback(
    (quietly = false) => {
      latest.current += 1
      const ticket = latest.current
      const settle = (next: Looked<T>) => {
        if (latest.current === ticket) setResult(next)
      }
      if (!quietly) setResult({ state: 'looking' })
      Promise.resolve()
        .then(lookup)
        .then(
          answer => settle(looked(answer)),
          () => settle({ state: 'failed' })
        )
    },
    [lookup]
  )
  useEffect(() => {
    run()
    return () => {
      latest.current += 1
    }
  }, [run])
  useEffect(() => {
    if (seen.current === data) return
    seen.current = data
    if (waitsForData(result, answerWaits)) run(true)
  }, [data, result, run, answerWaits])
  return [result, useCallback(() => run(), [run])]
}
