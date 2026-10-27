import type {
  FormExampleRows,
  KanjiRows,
  WordExampleRows,
  WordRows
} from '@zenbu/dictionary-core/detail/rows'
import type { DataState } from './data-state'
import type { Failure } from './messages'

export type NotReady = { type: 'not-ready'; data: DataState }
export type Lookup<T> = Promise<T | NotReady | Failure>
export type WordAnswer = { type: 'word'; rows: WordRows | null }
export type KanjiAnswer = {
  type: 'kanji'
  rows: KanjiRows | null
  strokes: 'ready' | 'downloading'
}
export type WordExamplesAnswer = { type: 'word-examples'; rows: WordExampleRows[] }
export type FormExamplesAnswer = { type: 'form-examples'; rows: FormExampleRows[]; listed: number }
export type ResolveAnswer = { type: 'resolve'; entSeq: number | null }

const notBuilt: Failure = { type: 'failed', reason: 'The dictionary lookups come with #956.' }
const stub = () => Promise.resolve(notBuilt)

export const lookUpWord: (entSeq: number) => Lookup<WordAnswer> = stub
export const lookUpKanji: (character: string) => Lookup<KanjiAnswer> = stub
export const lookUpWordExamples: (entSeq: number, from: number) => Lookup<WordExamplesAnswer> = stub
export const lookUpFormExamples: (form: string, from: number) => Lookup<FormExamplesAnswer> = stub
export const resolveWord: (headword: string, reading: string) => Lookup<ResolveAnswer> = stub
