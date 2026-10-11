import type { ArtifactDatabase, SqlValue } from '../artifact/database'
import type {
  KanjiElementEntry,
  KanjiElementSources,
  KanjiReferenceEntry,
  KanjiSources,
  KanjiStructureEntry
} from '../artifact/kanji-data'
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

export interface EmbeddedHost {
  all?(sql: string, parametersJSON: string): HostRows | null
  interrupted?(): boolean
  tokenize?(text: string): KuromojiToken[]
  tokenizerFile?(file: IpadicFile): ArrayBuffer | null
  kanjiSources?(): HostKanjiSources | null
  kanjiEntry?(character: string): KanjiReferenceEntry | null
  kanjiStructure?(character: string): KanjiStructureEntry | null
  kanjiElement?(glyph: string): KanjiElementEntry | null
  radicals?(): unknown
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
