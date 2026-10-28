import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { describe, expect, it, vi } from 'vitest'
import type { DataState } from '../shared/data-state'
import type { DictionaryRequest } from '../shared/messages'
import { answer, type WorkerData } from './answer'
import type { OpenDictionary } from './open-dictionary'

const downloading: DataState = { state: 'downloading', done: 40, total: 100 }
const ready: DataState = { state: 'ready', release: '2026.10.1', bytes: 100, checkedAt: 1 }

function worker(open: OpenDictionary | null, state: DataState = downloading): WorkerData {
  return { state: () => state, open: () => open, update: vi.fn() }
}

const kanjiRows = { kanji: { character: '要' }, strokes: null }

const dictionary = {
  segmentation: (_text: string, options: { writtenAlike?: boolean }) => ({
    tokens: options.writtenAlike
      ? [{ text: '要', languageReferenceID: 'you', writtenAlike: ['kaname'] }]
      : [],
    romaji: 'tabemasu'
  }),
  kanji: () => ({ rows: kanjiRows }),
  wordExamples: (entSeq: number) => (entSeq === 1546640 ? { rows: ['example'] } : null),
  formExamples: (form: string, from: number) => ({ rows: [`${form} from ${from}`], listed: 51 }),
  resolve: (headword: string) => (headword === '有る' ? 1296400 : null)
} as unknown as Dictionary

const opened = (
  attached: OpenDictionary['attached'],
  using: Dictionary = dictionary
): OpenDictionary => ({ dictionary: using, attached, close: () => undefined })

const ask = (request: DictionaryRequest, attached: OpenDictionary['attached'] = ['jlpt']) =>
  answer(request, worker(opened(attached), ready))

describe('answering a dictionary request', () => {
  it.each<DictionaryRequest>([
    { type: 'segment', text: '食べます' },
    { type: 'popup', languageReferenceID: 'jmdict:1358280', frequency: ['youtube'] },
    { type: 'word', entSeq: 1358280 },
    { type: 'kanji', character: '食' },
    { type: 'word-examples', entSeq: 1546640, from: 10 },
    { type: 'form-examples', form: 'いる', from: 0 },
    { type: 'resolve', headword: '有る', reading: 'ある' }
  ])('answers $type before the language data is ready with where the download is', request => {
    expect(answer(request, worker(null))).toEqual({ type: 'not-ready', data: downloading })
  })

  it('answers the state, and starts an update when asked for one', () => {
    const asked = worker(null)
    expect(answer({ type: 'update' }, asked)).toEqual({ type: 'state', data: downloading })
    expect(asked.update).toHaveBeenCalledOnce()
    expect(answer({ type: 'state' }, asked)).toEqual({ type: 'state', data: downloading })
  })

  it('splits text once it is ready, naming the other words written as each linked one', () => {
    expect(ask({ type: 'segment', text: '食べます' })).toEqual({
      type: 'segment',
      tokens: [{ text: '要', languageReferenceID: 'you', writtenAlike: ['kaname'] }],
      romaji: 'tabemasu'
    })
  })

  it('answers a kanji’s rows while its stroke data is still downloading, and says so', () => {
    expect(ask({ type: 'kanji', character: '要' })).toEqual({
      type: 'kanji',
      rows: kanjiRows,
      strokes: 'downloading'
    })
    expect(ask({ type: 'kanji', character: '要' }, ['jlpt', 'strokes'])).toMatchObject({
      strokes: 'ready'
    })
  })

  it('answers a page of a word’s examples, and none for an unknown word', () => {
    expect(ask({ type: 'word-examples', entSeq: 1546640, from: 10 })).toEqual({
      type: 'word-examples',
      rows: ['example']
    })
    expect(ask({ type: 'word-examples', entSeq: 1, from: 0 })).toEqual({
      type: 'word-examples',
      rows: []
    })
  })

  it('answers a page of a form’s examples with how many there are', () => {
    expect(ask({ type: 'form-examples', form: 'いる', from: 10 })).toEqual({
      type: 'form-examples',
      rows: ['いる from 10'],
      listed: 51
    })
  })

  it('resolves a related word to its entry, or to null', () => {
    expect(ask({ type: 'resolve', headword: '有る', reading: 'ある' })).toEqual({
      type: 'resolve',
      entSeq: 1296400
    })
    expect(ask({ type: 'resolve', headword: '食べる', reading: 'たべる' })).toEqual({
      type: 'resolve',
      entSeq: null
    })
  })

  it('answers a failed lookup with its reason', () => {
    const failing = {
      kanji: () => {
        throw new Error('no such table: kanji_strokes')
      }
    } as unknown as Dictionary
    expect(
      answer({ type: 'kanji', character: '食' }, worker(opened(['strokes'], failing), ready))
    ).toEqual({ type: 'failed', reason: 'no such table: kanji_strokes' })
  })
})
