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

const bundled: ReadonlySet<string> = new Set(defaultFrequencyPacks.map(pack => pack.id))

function chosenKeeping(was: string[], ours: string[]): string[] {
  const left = [...ours]
  const chosen = was.flatMap(id => {
    if (!bundled.has(id)) return [id]
    const next = left.shift()
    return next === undefined ? [] : [next]
  })
  return [...chosen, ...left]
}

function choiceOf(settings: Settings, rows: FrequencyRow[]): FrequencyChoice {
  return {
    'frequencyDictionaries.order': rows.map(row => row.dictionary.id),
    'frequencyDictionaries.chosen': chosenKeeping(
      settings['frequencyDictionaries.chosen'],
      rows.filter(row => row.chosen).map(row => row.dictionary.id)
    )
  }
}

export function moved(settings: Settings, id: string, by: -1 | 1): FrequencyChoice {
  const rows = frequencyRows(settings)
  const from = rows.findIndex(row => row.dictionary.id === id)
  const to = from + by
  if (from === -1 || to < 0 || to >= rows.length) return choiceOf(settings, rows)
  const reordered = [...rows]
  ;[reordered[from], reordered[to]] = [reordered[to], reordered[from]]
  return choiceOf(settings, reordered)
}

export function chosenWith(settings: Settings, id: string, chosen: boolean): FrequencyChoice {
  return choiceOf(
    settings,
    frequencyRows(settings).map(row => (row.dictionary.id === id ? { ...row, chosen } : row))
  )
}
