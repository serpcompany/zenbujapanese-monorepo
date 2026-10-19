import type { ArtifactDatabase } from '../artifact/database'
import { romaji } from '../detail/romaji'

export interface LearnerWord {
  written: string
  reading?: string | null
}

export interface SiriWord {
  spoken: string
  written: string
}

export interface SiriWordsRequest {
  learner: readonly LearnerWord[]
  limit: number
}

const easiestCommonLevel = 3
const longestSpokenForm = 32
const mostSpokenWords = 3
const spokenLetters = /^[a-z]+(?:[ '-][a-z]+)*$/

function plainLatin(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function romanized(text: string): string | null {
  const typed = plainLatin(text)
  if (spokenLetters.test(typed)) return typed
  const reading = romaji(text)
  return reading === null ? null : plainLatin(reading.replaceAll("'", ''))
}

export function spokenForm(text: string): string | null {
  const spoken = romanized(text)
  if (spoken === null || spoken.length > longestSpokenForm) return null
  return spokenLetters.test(spoken) && spoken.split(' ').length <= mostSpokenWords ? spoken : null
}

function onlyReading(db: ArtifactDatabase, written: string): string | null {
  const readings = db.all<{ reading: string }>(
    `SELECT DISTINCT e.reading FROM forms f JOIN entries e ON e.id = f.entry_id
     WHERE f.form = ? AND f.kind = 0 LIMIT 2`,
    [written]
  )
  return readings.length === 1 ? readings[0].reading : null
}

function learnerSpokenForm(db: ArtifactDatabase, { written, reading = null }: LearnerWord) {
  const spoken = spokenForm(reading ?? written)
  if (spoken !== null || reading !== null) return spoken
  const only = onlyReading(db, written)
  return only === null ? null : spokenForm(only)
}

function commonWords(db: ArtifactDatabase): { headword: string; reading: string }[] {
  return db.all(
    `SELECT e.headword, e.reading FROM jlpt.level_evidence l
     JOIN entries e ON e.id = l.language_reference_id
     LEFT JOIN tubelex.frequency_evidence t ON t.language_reference_id = l.language_reference_id
     WHERE l.level >= ?
     ORDER BY l.level DESC, t.rank IS NULL, t.rank, e.id`,
    [easiestCommonLevel]
  )
}

export function siriWords(db: ArtifactDatabase, { learner, limit }: SiriWordsRequest): SiriWord[] {
  const words: SiriWord[] = []
  const spokenSoFar = new Set<string>()
  const add = (written: string, spoken: string | null) => {
    if (spoken === null || spokenSoFar.has(spoken)) return
    spokenSoFar.add(spoken)
    words.push({ spoken, written })
  }
  for (const word of learner) {
    if (words.length >= limit) return words
    add(word.written, learnerSpokenForm(db, word))
  }
  for (const { headword, reading } of commonWords(db)) {
    if (words.length >= limit) return words
    add(headword, spokenForm(reading))
  }
  return words
}
