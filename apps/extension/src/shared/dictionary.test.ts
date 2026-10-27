import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataState } from './data-state'
import {
  type Ask,
  checkForUpdates,
  type FormExamplesAnswer,
  type KanjiAnswer,
  lookUpFormExamples,
  lookUpKanji,
  lookUpPopupCard,
  lookUpWord,
  lookUpWordExamples,
  type NotReady,
  openWelcomeTab,
  type PopupAnswer,
  type ResolveAnswer,
  readDataState,
  resolveWord,
  type SegmentAnswer,
  type StateAnswer,
  segmentText,
  type WordAnswer,
  type WordExamplesAnswer
} from './dictionary'
import type { DictionaryAnswer, DictionaryRequest } from './messages'

const downloading: DataState = { state: 'downloading', done: 1, total: 2 }
const state: StateAnswer = { type: 'state', data: downloading }
const segment: SegmentAnswer = { type: 'segment', tokens: [], romaji: 'tabemasu' }
const popup: PopupAnswer = { type: 'popup', card: null }
const word: WordAnswer = { type: 'word', rows: null }
const kanji: KanjiAnswer = { type: 'kanji', rows: null, strokes: 'downloading' }
const wordExamples: WordExamplesAnswer = { type: 'word-examples', rows: [] }
const formExamples: FormExamplesAnswer = { type: 'form-examples', rows: [], listed: 0 }
const resolved: ResolveAnswer = { type: 'resolve', entSeq: 1296400 }
const notReady: NotReady = { type: 'not-ready', data: downloading }

function answering(answer: DictionaryAnswer) {
  const asked: DictionaryRequest[] = []
  const ask: Ask = async request => {
    asked.push(request)
    return answer
  }
  return { ask, asked }
}

afterEach(() => vi.unstubAllGlobals())

describe('the dictionary helpers', () => {
  it.each<[string, (ask: Ask) => Promise<unknown>, DictionaryRequest, DictionaryAnswer]>([
    ['readDataState', readDataState, { type: 'state' }, state],
    ['checkForUpdates', checkForUpdates, { type: 'update' }, state],
    [
      'segmentText',
      ask => segmentText('食べます', ask),
      { type: 'segment', text: '食べます' },
      segment
    ],
    [
      'lookUpPopupCard',
      ask => lookUpPopupCard('abc', ['youtube'], ask),
      { type: 'popup', languageReferenceID: 'abc', frequency: ['youtube'] },
      popup
    ],
    ['lookUpWord', ask => lookUpWord(1546640, ask), { type: 'word', entSeq: 1546640 }, word],
    ['lookUpKanji', ask => lookUpKanji('要', ask), { type: 'kanji', character: '要' }, kanji],
    [
      'lookUpWordExamples',
      ask => lookUpWordExamples(1546640, 10, ask),
      { type: 'word-examples', entSeq: 1546640, from: 10 },
      wordExamples
    ],
    [
      'lookUpFormExamples',
      ask => lookUpFormExamples('いる', 10, ask),
      { type: 'form-examples', form: 'いる', from: 10 },
      formExamples
    ],
    [
      'resolveWord',
      ask => resolveWord('有る', 'ある', ask),
      { type: 'resolve', headword: '有る', reading: 'ある' },
      resolved
    ]
  ])('%s asks for its request and answers what the worker answers', async (_, helper, request, expected) => {
    const { ask, asked } = answering(expected)
    await expect(helper(ask)).resolves.toEqual(expected)
    expect(asked).toEqual([request])
  })

  it('passes on not-ready and a failure', async () => {
    await expect(lookUpWord(1, answering(notReady).ask)).resolves.toEqual(notReady)
    const failed = { type: 'failed', reason: 'The dictionary worker did not answer.' } as const
    await expect(lookUpWord(1, async () => failed)).resolves.toEqual(failed)
  })

  it('answers a failure for an answer to another request, or a throw', async () => {
    await expect(lookUpWord(1, answering({ type: 'resolve', entSeq: 1 }).ask)).resolves.toEqual({
      type: 'failed',
      reason: 'The dictionary answered resolve to word.'
    })
    await expect(
      readDataState(answering({ type: 'not-ready', data: downloading }).ask)
    ).resolves.toEqual({ type: 'failed', reason: 'The dictionary answered not-ready to state.' })
    await expect(
      resolveWord('有る', 'ある', () => {
        throw new Error('Extension context invalidated.')
      })
    ).resolves.toEqual({ type: 'failed', reason: 'Extension context invalidated.' })
  })

  it('opens the welcome tab, and never throws', async () => {
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => `chrome-extension://zenbu/${path}` }
    })
    const create = vi.fn(async () => ({}))
    await openWelcomeTab({ create } as never)
    expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://zenbu/pages/welcome.html' })
    await expect(
      openWelcomeTab({ create: () => Promise.reject(new Error('No window')) } as never)
    ).resolves.toBeUndefined()
  })
})
