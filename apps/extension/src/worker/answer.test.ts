import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { describe, expect, it, vi } from 'vitest'
import type { DataState } from '../shared/data-state'
import type { DictionaryRequest } from '../shared/messages'
import { answer, type WorkerData } from './answer'
import type { OpenDictionary } from './open-dictionary'

const downloading: DataState = { state: 'downloading', done: 40, total: 100 }
const ready: DataState = { state: 'ready', release: '2026.10.1' }

function worker(open: OpenDictionary | null, state: DataState = downloading): WorkerData {
  return { state: () => state, open: () => open, update: vi.fn() }
}

const dictionary = {
  segmentation: () => ({ tokens: [], romaji: 'tabemasu' }),
  kanji: () => {
    throw new Error('no such table: kanji_strokes')
  }
} as unknown as Dictionary

const opened = (attached: OpenDictionary['attached']): OpenDictionary => ({
  dictionary,
  attached,
  close: () => undefined
})

describe('answering a dictionary request', () => {
  it.each<DictionaryRequest>([
    { type: 'segment', text: '食べます' },
    { type: 'popup', languageReferenceID: 'jmdict:1358280', frequency: ['youtube'] },
    { type: 'word', entSeq: 1358280 },
    { type: 'kanji', character: '食' }
  ])('answers $type before the language data is ready with where the download is', request => {
    expect(answer(request, worker(null))).toEqual({ type: 'not-ready', data: downloading })
  })

  it('answers the state, and starts an update when asked for one', () => {
    const asked = worker(null)
    expect(answer({ type: 'update' }, asked)).toEqual({ type: 'state', data: downloading })
    expect(asked.update).toHaveBeenCalledOnce()
    expect(answer({ type: 'state' }, asked)).toEqual({ type: 'state', data: downloading })
  })

  it('looks up from the open dictionary once it is ready', () => {
    expect(answer({ type: 'segment', text: '食べます' }, worker(opened(['jlpt']), ready))).toEqual({
      type: 'segment',
      tokens: [],
      romaji: 'tabemasu'
    })
  })

  it('says the kanji stroke data is still downloading before it is attached', () => {
    expect(answer({ type: 'kanji', character: '食' }, worker(opened(['jlpt']), ready))).toEqual({
      type: 'failed',
      reason: 'The kanji stroke data is still downloading. Try again in a minute.'
    })
  })

  it('answers a failed lookup with its reason', () => {
    const open = worker(opened(['jlpt', 'strokes']), ready)
    expect(answer({ type: 'kanji', character: '食' }, open)).toEqual({
      type: 'failed',
      reason: 'no such table: kanji_strokes'
    })
  })
})
