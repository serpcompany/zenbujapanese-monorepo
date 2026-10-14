import {
  defaultFrequencyPacks,
  type EvidenceLookup,
  type FrequencyDictionary,
  type FrequencyEvidence
} from '../detail/frequency'
import type { FrequencyRow } from '../detail/rows'
import { type ArtifactDatabase, listedIds, type SqlValue } from './database'

type EvidenceRows = readonly Record<string, unknown>[]

export interface ReadableFrequencyList {
  dictionary: FrequencyDictionary
  schema?: string
  rows(sql: string, params: readonly SqlValue[]): EvidenceRows | null
}

export type FrequencyList =
  | ReadableFrequencyList
  | { dictionary: FrequencyDictionary | null; unavailable: string }

const unreadableFrequency = 'Frequency data unavailable'

const evidenceTables = {
  level: { table: 'level_evidence', value: 'level' },
  rank: { table: 'frequency_evidence', value: 'rank' }
} as const

function valuesById(rows: EvidenceRows | null): Map<string, number> | null {
  if (!rows) return null
  const values = new Map<string, number>()
  for (const { id, value } of rows) {
    if (typeof id !== 'string' || typeof value !== 'number' || !Number.isInteger(value)) return null
    values.set(id, value)
  }
  return values
}

export function readFrequency(
  lists: readonly FrequencyList[],
  ids: readonly string[]
): FrequencyEvidence {
  const asked = [...new Set(ids)]
  const listed = [JSON.stringify(asked)]
  const dictionaries: FrequencyDictionary[] = []
  const lookups: EvidenceLookup[][] = asked.map(() => [])
  for (const list of lists) {
    if ('unavailable' in list) {
      const dictionary = list.dictionary ? dictionaries.push(list.dictionary) - 1 : null
      for (const entry of lookups) entry.push({ dictionary, unavailable: list.unavailable })
      continue
    }
    const dictionary = dictionaries.push(list.dictionary) - 1
    if (asked.length === 0) continue
    const { table, value } = evidenceTables[list.dictionary.kind]
    const values = valuesById(
      list.rows(
        `SELECT lower(hex(language_reference_id)) AS id, ${value} AS value
         FROM ${list.schema ? `${list.schema}.` : ''}${table}
         WHERE language_reference_id IN (${listedIds})`,
        listed
      )
    )
    for (let index = 0; index < asked.length; index++) {
      lookups[index].push(
        values
          ? { dictionary, value: values.get(asked[index]) ?? null }
          : { dictionary, unavailable: unreadableFrequency }
      )
    }
  }
  return {
    dictionaries,
    entries: Object.fromEntries(asked.map((id, index) => [id, lookups[index]]))
  }
}

const bundledRow: { [Pack in FrequencyRow['pack']]: (value: number) => FrequencyRow } = {
  jlpt: level => ({ pack: 'jlpt', level }),
  tubelex: rank => ({ pack: 'tubelex', rank })
}

export function bundledFrequency(
  db: ArtifactDatabase,
  ids: readonly string[]
): Map<string, FrequencyRow[]> {
  const evidence = readFrequency(
    defaultFrequencyPacks.map(dictionary => ({
      dictionary,
      schema: dictionary.pack,
      rows: (sql: string, params: readonly SqlValue[]) =>
        db.all<Record<string, unknown>>(sql, params)
    })),
    ids
  )
  const frequency = new Map<string, FrequencyRow[]>()
  for (const [id, lookups] of Object.entries(evidence.entries)) {
    const rows = lookups.flatMap((lookup, position) => {
      const { pack, name } = defaultFrequencyPacks[position]
      if ('unavailable' in lookup) throw new Error(`${name}: ${lookup.unavailable}`)
      return lookup.value === null ? [] : [bundledRow[pack](lookup.value)]
    })
    if (rows.length > 0) frequency.set(id, rows)
  }
  return frequency
}
