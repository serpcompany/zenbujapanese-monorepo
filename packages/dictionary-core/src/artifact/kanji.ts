// A kanji page's rows, read when the page is asked for (ADR 0009): the kanji and its structure
// from the kanji files (./kanji-data.ts), its stroke order from the attached KanjiStrokeData
// (KanjiVG), and its words as `entries(containingKanji:)` in LookupClient.swift finds them.

import { kanjiWords } from '../detail/kanji'
import type { KanjiRows, KanjiStrokesRow, KanjiWordRow } from '../detail/rows'
import type { ArtifactDatabase } from './database'
import type { KanjiData } from './kanji-data'

/**
 * Every entry in the semantic-fingerprint groups `kanjiCandidateRowsSQL` reads for the kanji:
 * the groups of entries with a written form containing it (`instr(f.form, ?)`, the app's scan).
 * `kanjiWords` orders the groups and picks each group's entry.
 */
export function kanjiCandidateRows(db: ArtifactDatabase, character: string): KanjiWordRow[] {
  const rows = db.all<{
    id: string
    ent_seq: number
    headword: string
    reading: string
    summary: string
    fingerprint: string
    is_common: number
    rank_score: number
    contains_kanji: number
  }>(
    `WITH matching AS (
       SELECT DISTINCT f.entry_id FROM forms f WHERE f.kind = 0 AND instr(f.form, ?) > 0
     )
     SELECT lower(hex(e.id)) AS id, e.source_record_id AS ent_seq, e.headword, e.reading,
       e.summary, lower(hex(e.semantic_fingerprint)) AS fingerprint, e.is_common, e.rank_score,
       e.id IN (SELECT entry_id FROM matching) AS contains_kanji
     FROM entries e
     WHERE e.semantic_fingerprint IN (
       SELECT m.semantic_fingerprint FROM entries m WHERE m.id IN (SELECT entry_id FROM matching)
     )
     ORDER BY lower(hex(e.id))`,
    [character]
  )
  return rows.map(row => ({
    id: row.id,
    entSeq: row.ent_seq,
    headword: row.headword,
    reading: row.reading,
    summary: row.summary,
    fingerprint: row.fingerprint,
    isCommon: row.is_common !== 0,
    rankScore: row.rank_score,
    containsKanji: row.contains_kanji !== 0
  }))
}

/** The kanji's stroke order (KanjiVG); null for a kanji KanjiStrokeData.sqlite3 doesn't draw. */
export function kanjiStrokes(db: ArtifactDatabase, character: string): KanjiStrokesRow | null {
  const [row] = db.all<{ viewport_size: number; stroke_count: number; strokes_json: string }>(
    'SELECT viewport_size, stroke_count, strokes_json FROM strokes.stroke_diagrams WHERE character = ?',
    [character]
  )
  return row
    ? {
        viewportSize: row.viewport_size,
        strokeCount: row.stroke_count,
        strokes: JSON.parse(row.strokes_json)
      }
    : null
}

/** Everything a kanji page reads, or null for a character with no page. */
export function readKanji(
  db: ArtifactDatabase,
  data: KanjiData,
  character: string
): KanjiRows | null {
  const kanji = data.row(character)
  if (!kanji) return null
  const structure = data.structure(character)
  return {
    kanji,
    structure,
    elements: structure ? data.elementRows(structure.elementGlyphs) : [],
    words: kanjiWords(character, kanjiCandidateRows(db, character)).map(
      ({ id, entSeq, headword, reading, summary }) => ({ id, entSeq, headword, reading, summary })
    ),
    strokes: kanjiStrokes(db, character)
  }
}
