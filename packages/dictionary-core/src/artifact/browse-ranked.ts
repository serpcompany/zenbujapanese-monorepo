import { type RankedList, rankBandSize, rankBands, rankedListLimit } from '../browse/lists'
import type { ArtifactDatabase, SqlValue } from './database'

interface RankedSource {
  from: string
  params: SqlValue[]
}

function rankedSource(list: RankedList): RankedSource {
  return list.source.kind === 'tubelex'
    ? { from: 'tubelex.frequency_evidence r', params: [] }
    : {
        from: `ranked.ranked_evidence r
          JOIN ranked.ranked_lists l ON l.list_id = r.list_id AND l.pack_id = ?`,
        params: [list.source.packId]
      }
}

interface RankedRow {
  rowid: number
  rank: number
}

export function rankedRows(
  db: ArtifactDatabase,
  list: RankedList,
  firstRank: number,
  lastRank: number,
  limit = rankedListLimit
): RankedRow[] {
  const { from, params } = rankedSource(list)
  return db.all<RankedRow>(
    `SELECT e.rowid AS rowid, r.rank AS rank FROM ${from}
     JOIN entries e ON e.id = r.language_reference_id
     WHERE r.rank BETWEEN ? AND ? ORDER BY r.rank, e.reading, e.source_record_id LIMIT ?`,
    [...params, firstRank, lastRank, limit]
  )
}

export interface RankedCounts {
  mapped: number
  listed: number
}

export function rankedCounts(db: ArtifactDatabase, list: RankedList): RankedCounts {
  const { from, params } = rankedSource(list)
  const [counts] = db.all<RankedCounts>(
    `SELECT count(*) AS mapped, count(CASE WHEN r.rank <= ? THEN 1 END) AS listed FROM ${from}`,
    [rankedListLimit, ...params]
  )
  return counts
}

export function rankedBandCounts(db: ArtifactDatabase, list: RankedList): number[] {
  const { from, params } = rankedSource(list)
  const counted = new Map(
    db
      .all<{ band: number; count: number }>(
        `SELECT (r.rank - 1) / ${rankBandSize} + 1 AS band, count(*) AS count FROM ${from}
         WHERE r.rank BETWEEN 1 AND ? GROUP BY band`,
        [...params, rankedListLimit]
      )
      .map(({ band, count }) => [band, count])
  )
  return Array.from({ length: rankBands }, (_, index) => counted.get(index + 1) ?? 0)
}

export function jlptRowids(db: ArtifactDatabase, level: number): number[] {
  return db
    .all<{ rowid: number }>(
      `SELECT e.rowid AS rowid FROM jlpt.level_evidence j
       JOIN entries e ON e.id = j.language_reference_id
       WHERE j.level = ? ORDER BY e.reading, e.source_record_id`,
      [level]
    )
    .map(row => row.rowid)
}
