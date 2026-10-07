import type {
  KanjiDetail,
  KanjiElement,
  KanjiReading,
  KanjiWord
} from '@zenbu/dictionary-core/detail/kanji'
import type { Linked } from './page-example'

export interface KanjiDetailsData
  extends Omit<KanjiDetail, 'readings' | 'components' | 'elements' | 'words'> {
  readings: (Omit<KanjiReading, 'words'> & { words: Linked<KanjiWord>[] })[]
  components: Linked<{ character: string }>[]
  elements: Linked<KanjiElement>[]
  words: Linked<KanjiWord>[]
}
