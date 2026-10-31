import { useSyncExternalStore } from 'react'
import type { DataState } from '../shared/data-state'

const listeners = new Set<() => void>()
let current: DataState | null = null

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const again = () => undefined

export function setDataState(next: DataState | null) {
  current = next
  for (const listener of listeners) listener()
}

function useFakeDataState(): [DataState | null, () => void] {
  return [useSyncExternalStore(subscribe, () => current), again]
}

function FakeDictionaryProgress({ data }: { data: DataState }) {
  return <p data-progress={data.state} />
}

export const fakeDictionaryProgress = {
  useDataState: useFakeDataState,
  DictionaryProgress: FakeDictionaryProgress
}
