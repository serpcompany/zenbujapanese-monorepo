import {
  defaultFrequencyPacks,
  type FrequencyDictionary
} from '@zenbu/dictionary-core/detail/frequency'
import type { Settings } from '../shared/settings'

type FrequencyRow = { dictionary: FrequencyDictionary; chosen: boolean }

type FrequencyChoice = Pick<
  Settings,
  'frequencyDictionaries.chosen' | 'frequencyDictionaries.order'
>

const position = (order: string[], id: string) => {
  const found = order.indexOf(id)
  return found === -1 ? order.length : found
}

export function frequencyRows(settings: Settings): FrequencyRow[] {
  const order = settings['frequencyDictionaries.order']
  const chosen = settings['frequencyDictionaries.chosen']
  return [...defaultFrequencyPacks]
    .sort((first, second) => position(order, first.id) - position(order, second.id))
    .map(dictionary => ({ dictionary, chosen: chosen.includes(dictionary.id) }))
}

function choiceOf(rows: FrequencyRow[]): FrequencyChoice {
  return {
    'frequencyDictionaries.order': rows.map(row => row.dictionary.id),
    'frequencyDictionaries.chosen': rows.filter(row => row.chosen).map(row => row.dictionary.id)
  }
}

export function moved(settings: Settings, id: string, by: -1 | 1): FrequencyChoice {
  const rows = frequencyRows(settings)
  const from = rows.findIndex(row => row.dictionary.id === id)
  const to = from + by
  if (from === -1 || to < 0 || to >= rows.length) return choiceOf(rows)
  const reordered = [...rows]
  ;[reordered[from], reordered[to]] = [reordered[to], reordered[from]]
  return choiceOf(reordered)
}

export function chosenWith(settings: Settings, id: string, chosen: boolean): FrequencyChoice {
  return choiceOf(
    frequencyRows(settings).map(row => (row.dictionary.id === id ? { ...row, chosen } : row))
  )
}
