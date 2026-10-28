import type { NotReady, StateAnswer } from './answers'
import { welcomePage } from './language-data'
import {
  askDictionary,
  type DictionaryAnswer,
  type DictionaryRequest,
  type Failure,
  failure
} from './messages'

export type {
  FormExamplesAnswer,
  KanjiAnswer,
  NotReady,
  PopupAnswer,
  ResolveAnswer,
  SegmentAnswer,
  StateAnswer,
  WordAnswer,
  WordExamplesAnswer
} from './answers'

export type Lookup<T> = Promise<T | NotReady | Failure>

export type Ask = (request: DictionaryRequest) => Promise<DictionaryAnswer | Failure>

type Answer<T extends DictionaryAnswer['type']> = Extract<DictionaryAnswer, { type: T }>

function send(request: DictionaryRequest, ask: Ask) {
  return Promise.resolve()
    .then(() => ask(request))
    .catch((error: unknown) => failure(error))
}

const unexpected = (answer: DictionaryAnswer, request: DictionaryRequest): Failure => ({
  type: 'failed',
  reason: `The dictionary answered ${answer.type} to ${request.type}.`
})

function lookUp<T extends DictionaryAnswer['type']>(
  expected: T,
  request: DictionaryRequest,
  ask: Ask
): Lookup<Answer<T>> {
  return send(request, ask).then(answer =>
    answer.type === expected || answer.type === 'not-ready' || answer.type === 'failed'
      ? (answer as Answer<T> | NotReady | Failure)
      : unexpected(answer, request)
  )
}

function dataState(request: DictionaryRequest, ask: Ask): Promise<StateAnswer | Failure> {
  return send(request, ask).then(answer =>
    answer.type === 'state' || answer.type === 'failed' ? answer : unexpected(answer, request)
  )
}

export const readDataState = (ask: Ask = askDictionary) => dataState({ type: 'state' }, ask)

export const checkForUpdates = (ask: Ask = askDictionary) => dataState({ type: 'update' }, ask)

export const openWelcomeTab = (tabs: Pick<typeof chrome.tabs, 'create'> = chrome.tabs) =>
  Promise.resolve()
    .then(() => tabs.create({ url: chrome.runtime.getURL(welcomePage) }))
    .then(
      () => undefined,
      () => undefined
    )

export const segmentText = (text: string, ask: Ask = askDictionary) =>
  lookUp('segment', { type: 'segment', text }, ask)

export const lookUpPopupCard = (
  languageReferenceID: string,
  frequency: readonly string[],
  ask: Ask = askDictionary
) => lookUp('popup', { type: 'popup', languageReferenceID, frequency }, ask)

export const lookUpWord = (entSeq: number, ask: Ask = askDictionary) =>
  lookUp('word', { type: 'word', entSeq }, ask)

export const lookUpKanji = (character: string, ask: Ask = askDictionary) =>
  lookUp('kanji', { type: 'kanji', character }, ask)

export const lookUpWordExamples = (entSeq: number, from: number, ask: Ask = askDictionary) =>
  lookUp('word-examples', { type: 'word-examples', entSeq, from }, ask)

export const lookUpFormExamples = (form: string, from: number, ask: Ask = askDictionary) =>
  lookUp('form-examples', { type: 'form-examples', form, from }, ask)

export const resolveWord = (headword: string, reading: string, ask: Ask = askDictionary) =>
  lookUp('resolve', { type: 'resolve', headword, reading }, ask)
