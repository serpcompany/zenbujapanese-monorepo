import { isContentWord } from '../browse/content-words'
import { hiraganaRange, type KanaScript } from '../browse/kana'
import { type FrequencyResult, frequencyChips } from '../detail/frequency'
import { type RubySegment, rubySegments } from '../detail/ruby'
import type { ArtifactDatabase, SqlValue } from './database'
import { frequencyByEntry, listedFrequencyQueries } from './frequency'

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

const contentWordBatch = 100

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

function senseMeanings(
  db: ArtifactDatabase,
  rowids: readonly number[],
  labelledSense: ReadonlyMap<number, number>
): Map<number, string> {
  const senses = rowids.flatMap(rowid => {
    const sense = labelledSense.get(rowid)
    return sense === undefined ? [] : [[rowid, sense]]
  })
  if (senses.length === 0) return new Map()
  const rows = db.all<{ rowid: number; meaning: string | null }>(
    `SELECT e.rowid AS rowid,
       json_extract(e.senses_json, '$[' || json_extract(p.value, '$[1]') || '].meaning') AS meaning
     FROM json_each(?) p JOIN entries e ON e.rowid = json_extract(p.value, '$[0]')`,
    [JSON.stringify(senses)]
  )
  return new Map(rows.flatMap(row => (row.meaning === null ? [] : [[row.rowid, row.meaning]])))
}

interface BrowseWordOptions {
  ranks?: ReadonlyMap<number, number>
  labelledSense?: ReadonlyMap<number, number>
}

export function browseWords(
  db: ArtifactDatabase,
  rowids: readonly number[],
  { ranks = new Map(), labelledSense = new Map() }: BrowseWordOptions = {}
): BrowseWord[] {
  const records = entryRecords(db, rowids)
  if (records.length === 0) return []
  const queries = listedFrequencyQueries(records.map(record => record.id))
  const frequency = frequencyByEntry(
    db.all(queries.levels, queries.params),
    db.all(queries.ranks, queries.params)
  )
  const meanings = senseMeanings(db, rowids, labelledSense)
  return records.map(record => ({
    entSeq: record.ent_seq,
    headword: record.headword,
    reading: record.reading,
    ruby: rubySegments(record.headword, record.reading),
    summary: meanings.get(record.rowid) ?? record.summary,
    chips: frequencyChips(frequency.get(record.id) ?? []),
    rank: ranks.get(record.rowid) ?? null
  }))
}

export function contentWordRowids(
  db: ArtifactDatabase,
  rowids: ArrayLike<number>,
  wanted: number
): number[] {
  const found: number[] = []
  for (let start = 0; start < rowids.length && found.length < wanted; start += contentWordBatch) {
    const batch = Array.from(
      { length: Math.min(contentWordBatch, rowids.length - start) },
      (_, index) => rowids[start + index]
    )
    const parts = new Map(
      db
        .all<{ rowid: number; first: string | null; parts: string }>(
          `SELECT e.rowid AS rowid, json_extract(e.senses_json, '$[0].partsOfSpeech') AS first,
             e.parts_of_speech_json AS parts
           FROM entries e WHERE e.rowid IN (SELECT value FROM json_each(?))`,
          [JSON.stringify(batch)]
        )
        .map(row => [row.rowid, row])
    )
    for (const rowid of batch) {
      const row = parts.get(rowid)
      const first = row?.first ? (JSON.parse(row.first) as string[]) : []
      if (row && isContentWord(first, JSON.parse(row.parts) as string[])) found.push(rowid)
      if (found.length === wanted) break
    }
  }
  return found
}
