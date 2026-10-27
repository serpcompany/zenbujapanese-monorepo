import type { DataState } from './data-state'

export function useDataState(): [DataState | null, () => void] {
  return [null, () => undefined]
}

export function DictionaryProgress(_props: { data: DataState }) {
  return null
}
