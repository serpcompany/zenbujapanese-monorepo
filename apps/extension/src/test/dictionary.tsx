import type { DataState } from '../shared/data-state'

export const dictionary = {
  data: null as DataState | null,
  welcomeTabs: 0,
  checks: 0,
  polls: 0
}

export function resetDictionary(data: DataState | null = null): void {
  Object.assign(dictionary, { data, welcomeTabs: 0, checks: 0, polls: 0 })
}

export function openWelcomeTab(): Promise<void> {
  dictionary.welcomeTabs += 1
  return Promise.resolve()
}

export function checkForUpdates(): Promise<{ type: 'state'; data: DataState }> {
  dictionary.checks += 1
  return Promise.resolve({ type: 'state', data: { state: 'checking' } })
}

export function useDataState(): [DataState | null, () => void] {
  return [
    dictionary.data,
    () => {
      dictionary.polls += 1
    }
  ]
}

export function DictionaryProgress({ data }: { data: DataState }) {
  return <p data-test="dictionary-progress">{data.state}</p>
}
