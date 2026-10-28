import type { PopupCard } from '@zenbu/dictionary-core/cards/popup-card'
import type { PageSegmentedToken } from '@zenbu/dictionary-core/cards/segmentation'
import type {
  FormExampleRows,
  KanjiRows,
  WordExampleRows,
  WordRows
} from '@zenbu/dictionary-core/detail/rows'
import type { SearchResultsScreen } from '@zenbu/dictionary-core/results/results'
import type { DataState } from './data-state'

export type NotReady = { type: 'not-ready'; data: DataState }
export type StateAnswer = { type: 'state'; data: DataState }
export type SegmentAnswer = { type: 'segment'; tokens: PageSegmentedToken[]; romaji: string | null }
export type PopupAnswer = { type: 'popup'; card: PopupCard | null }
export type WordAnswer = { type: 'word'; rows: WordRows | null }
export type KanjiAnswer = {
  type: 'kanji'
  rows: KanjiRows | null
  strokes: 'ready' | 'downloading'
}
export type WordExamplesAnswer = { type: 'word-examples'; rows: WordExampleRows[] }
export type FormExamplesAnswer = { type: 'form-examples'; rows: FormExampleRows[]; listed: number }
export type ResolveAnswer = { type: 'resolve'; entSeq: number | null }
export type SearchAnswer = { type: 'search'; screen: SearchResultsScreen }
