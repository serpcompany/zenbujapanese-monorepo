import { hiraganaRange, type KanaScript } from '../browse/kana'
import { type FrequencyResult, frequencyChips } from '../detail/frequency'
import { type RubySegment, rubySegments } from '../detail/ruby'
import type { ArtifactDatabase, SqlValue } from './database'
import { frequencyByEntry, frequencyQueries } from './frequency'

export interface WordLink {
  entSeq: number
  headword: string
  reading: string
}

export interface BrowseWord extends WordLink {
  ruby: RubySegment[]
  summary: string
  chips: FrequencyResult[]
  rank: number | null
}

interface Filter {
  where: string
  params: SqlValue[]
}

interface EntryRecord {
  rowid: number
  id: string
  ent_seq: number
  headword: string
  reading: string
  summary: string
}

const inHiragana = 'substr(e.reading, 1, 1) BETWEEN ? AND ?'

export function scriptFilter(script: KanaScript): Filter {
  return {
    where: script === 'hiragana' ? inHiragana : `NOT (${inHiragana})`,
    params: [hiraganaRange.first, hiraganaRange.last]
  }
}

export function wordLinks(db: ArtifactDatabase, rowids: readonly number[]): WordLink[] {
  return entryRecords(db, rowids).map(record => ({
    entSeq: record.ent_seq,
    headword: record.headword,
    reading: record.reading
  }))
}

function entryRecords(db: ArtifactDatabase, rowids: readonly number[]): EntryRecord[] {
  if (rowids.length === 0) return []
  const records = db.all<EntryRecord>(
    `SELECT e.rowid AS rowid, lower(hex(e.id)) AS id, e.source_record_id AS ent_seq, e.headword,
       e.reading, e.summary FROM entries e WHERE e.rowid IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(rowids)]
  )
  const byRowid = new Map(records.map(record => [record.rowid, record]))
  return rowids.flatMap(rowid => byRowid.get(rowid) ?? [])
}

export function browseWords(
  db: ArtifactDatabase,
  rowids: readonly number[],
  ranks: ReadonlyMap<number, number> = new Map()
): BrowseWord[] {
  const records = entryRecords(db, rowids)
  if (records.length === 0) return []
  const queries = frequencyQueries(records.map(record => record.id))
  const frequency = frequencyByEntry(
    db.all(queries.levels, queries.params),
    db.all(queries.ranks, queries.params)
  )
  return records.map(record => ({
    entSeq: record.ent_seq,
    headword: record.headword,
    reading: record.reading,
    ruby: rubySegments(record.headword, record.reading),
    summary: record.summary,
    chips: frequencyChips(frequency.get(record.id) ?? []),
    rank: ranks.get(record.rowid) ?? null
  }))
}
