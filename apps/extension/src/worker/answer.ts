import type { DataState } from '../shared/data-state'
import {
  type DictionaryAnswer,
  type DictionaryRequest,
  type Failure,
  failure
} from '../shared/messages'
import type { OpenDictionary } from './open-dictionary'

export interface WorkerData {
  state(): DataState
  open(): OpenDictionary | null
  update(): void
}

type Lookup = Exclude<DictionaryRequest, { type: 'ping' | 'state' | 'update' }>

const unknownRequest: Failure = {
  type: 'failed',
  reason: 'The dictionary worker does not know this request.'
}

const lookups: ReadonlySet<string> = new Set<Lookup['type']>(['segment', 'popup', 'word', 'kanji'])

const strokesMissing = 'The kanji stroke data is still downloading. Try again in a minute.'

function lookUp(
  request: Lookup,
  { dictionary, attached }: OpenDictionary
): DictionaryAnswer | Failure {
  switch (request.type) {
    case 'segment':
      return { type: 'segment', ...dictionary.segmentation(request.text) }
    case 'popup':
      return {
        type: 'popup',
        card: dictionary.popupCard(request.languageReferenceID, request.frequency)
      }
    case 'word':
      return { type: 'word', rows: dictionary.word(request.entSeq)?.rows ?? null }
    case 'kanji':
      if (!attached.includes('strokes')) return { type: 'failed', reason: strokesMissing }
      return { type: 'kanji', rows: dictionary.kanji(request.character)?.rows ?? null }
  }
}

export function answer(request: DictionaryRequest, worker: WorkerData): DictionaryAnswer | Failure {
  switch (request.type) {
    case 'ping':
      return { type: 'pong', from: 'dictionary-worker' }
    case 'state':
      return { type: 'state', data: worker.state() }
    case 'update':
      worker.update()
      return { type: 'state', data: worker.state() }
  }
  if (!lookups.has(request.type)) return unknownRequest
  const open = worker.open()
  if (!open) return { type: 'not-ready', data: worker.state() }
  try {
    return lookUp(request, open)
  } catch (error) {
    return failure(error)
  }
}
