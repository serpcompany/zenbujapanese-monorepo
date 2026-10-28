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

const lookups: ReadonlySet<string> = new Set<Lookup['type']>([
  'segment',
  'popup',
  'word',
  'kanji',
  'word-examples',
  'form-examples',
  'resolve',
  'search'
])

async function lookUp(
  request: Lookup,
  { dictionary, attached }: OpenDictionary
): Promise<DictionaryAnswer | Failure> {
  switch (request.type) {
    case 'segment':
      return { type: 'segment', ...dictionary.segmentation(request.text, { writtenAlike: true }) }
    case 'popup':
      return {
        type: 'popup',
        card: dictionary.popupCard(request.languageReferenceID, request.frequency)
      }
    case 'word':
      return { type: 'word', rows: dictionary.word(request.entSeq)?.rows ?? null }
    case 'kanji':
      return {
        type: 'kanji',
        rows: dictionary.kanji(request.character)?.rows ?? null,
        strokes: attached.includes('strokes') ? 'ready' : 'downloading'
      }
    case 'word-examples':
      return {
        type: 'word-examples',
        rows: dictionary.wordExamples(request.entSeq, request.from)?.rows ?? []
      }
    case 'form-examples': {
      const { rows, listed } = dictionary.formExamples(request.form, request.from)
      return { type: 'form-examples', rows, listed }
    }
    case 'resolve':
      return { type: 'resolve', entSeq: dictionary.resolve(request.headword, request.reading) }
    case 'search':
      return { type: 'search', screen: (await dictionary.search(request.query)).screen }
  }
}

export async function answer(
  request: DictionaryRequest,
  worker: WorkerData
): Promise<DictionaryAnswer | Failure> {
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
    return await lookUp(request, open)
  } catch (error) {
    return failure(error)
  }
}
