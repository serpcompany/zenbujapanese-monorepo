import type { ArtifactDatabase, SqlValue } from '../artifact/database'
import { type FrequencyList, readFrequency } from '../artifact/frequency'
import type {
  KanjiElementEntry,
  KanjiElementSources,
  KanjiReferenceEntry,
  KanjiSources,
  KanjiStructureEntry
} from '../artifact/kanji-data'
import type { FrequencyDictionary, FrequencyEvidence } from '../detail/frequency'
import type { IpadicFile } from '../examples/ipadic'
import type { KuromojiToken } from '../examples/morphology'
import { stopIfInterrupted } from '../search/database'

export interface HostRows {
  rows?: Record<string, unknown>[]
  blobs?: string[]
  error?: string
}

interface HostKanjiSources extends KanjiSources {
  elements: KanjiElementSources
}

interface HostFrequencyList {
  dictionary: FrequencyDictionary
  unavailable?: string
}

type HostFrequencyLists = { lists: HostFrequencyList[] } | { unavailable: string }

export interface EmbeddedHost {
  all?(sql: string, parametersJSON: string): HostRows | null
  interrupted?(): boolean
  tokenize?(text: string): KuromojiToken[]
  tokenizerFile?(file: IpadicFile): ArrayBuffer | null
  kanjiSources?(): HostKanjiSources | null
  kanjiEntry?(character: string): KanjiReferenceEntry | null
  kanjiStructure?(character: string): KanjiStructureEntry | null
  kanjiElement?(glyph: string): KanjiElementEntry | null
  kanjiReference?(): unknown
  radicals?(): unknown
  frequencyLists?(): HostFrequencyLists | null
  frequencyListRows?(list: string, sql: string, parametersJSON: string): HostRows | null
}

function bytes(hex: string): Uint8Array {
  const decoded = new Uint8Array(hex.length / 2)
  for (let index = 0; index < decoded.length; index++) {
    decoded[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return decoded
}

export function hostDatabase(host: EmbeddedHost): ArtifactDatabase {
  return {
    all<Row>(sql: string, params: readonly SqlValue[] = []): Row[] {
      if (!host.all) throw new Error('The host has no dictionary to read')
      const answer = host.all(sql, JSON.stringify(params))
      if (!answer?.rows) throw new Error(answer?.error ?? 'The host returned no rows')
      stopIfInterrupted(host, 0)
      for (const column of answer.blobs ?? []) {
        for (const row of answer.rows) {
          const value = row[column]
          if (typeof value === 'string') row[column] = bytes(value)
        }
      }
      return answer.rows as Row[]
    },
    interrupted: () => host.interrupted?.() ?? false
  }
}

function hostFrequencyLists(host: EmbeddedHost): FrequencyList[] | null {
  if (!host.frequencyLists) return []
  const enabled = host.frequencyLists()
  if (!enabled) return null
  if ('unavailable' in enabled) return [{ dictionary: null, unavailable: enabled.unavailable }]
  return enabled.lists.map(({ dictionary, unavailable }) =>
    unavailable === undefined
      ? {
          dictionary,
          rows: (sql, params) =>
            host.frequencyListRows?.(dictionary.id, sql, JSON.stringify(params))?.rows ?? null
        }
      : { dictionary, unavailable }
  )
}

export function hostFrequency(
  host: EmbeddedHost,
  ids: readonly string[]
): FrequencyEvidence | null {
  const lists = hostFrequencyLists(host)
  return lists && readFrequency(lists, ids)
}
