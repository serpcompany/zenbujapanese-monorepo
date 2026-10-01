import type { PriorityProfile } from './rank'

export interface SearchDatabase {
  all<Row>(sql: string, params: readonly (string | number)[]): Promise<Row[]>
}

function truncatedAtNul(param: string | number): string | number {
  return typeof param === 'string' ? param.split('\0', 1)[0] : param
}

export function withParametersTruncatedAtNul(db: SearchDatabase): SearchDatabase {
  return {
    all<Row>(sql: string, params: readonly (string | number)[]): Promise<Row[]> {
      return db.all<Row>(sql, params.map(truncatedAtNul))
    }
  }
}

export const FormKind = { written: 0, reading: 1, romaji: 2 } as const

export interface SearchEntry {
  id: string
  sourceRecordId: number
  headword: string
  reading: string
  summary: string
  partsOfSpeech: string[]
}

export interface EntryRow {
  id: string
  source_record_id: number
  headword: string
  reading: string
  summary: string
  parts_of_speech_json: string
  semantic_fingerprint: string
  primary_mask: number | null
  secondary_mask: number | null
  news_frequency_band: number | null
}

export const entryColumns = `lower(hex(e.id)) AS id, e.source_record_id, e.headword, e.reading,
  e.summary, e.parts_of_speech_json, lower(hex(e.semantic_fingerprint)) AS semantic_fingerprint`

export function decodeEntry(row: EntryRow): SearchEntry {
  return {
    id: row.id,
    sourceRecordId: row.source_record_id,
    headword: row.headword,
    reading: row.reading,
    summary: row.summary,
    partsOfSpeech: JSON.parse(row.parts_of_speech_json)
  }
}

export function profile(row: EntryRow): PriorityProfile {
  return {
    primaryMask: row.primary_mask ?? 0,
    secondaryMask: row.secondary_mask ?? 0,
    newsFrequencyBand: row.news_frequency_band
  }
}
