import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import { pitchAccent } from '@zenbu/dictionary-core/detail/pitch'
import type { PitchRow } from '@zenbu/dictionary-core/detail/rows'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, artifactDatabase } from './support'

interface StoredPitch {
  entSeq: number
  reading: string
  pitch: string
}

const konoAida = 1004690
const mochi = 2577400
const mon = 2145190
const seaSerpent = 2595760

function storedPitches(db: ArtifactDatabase): StoredPitch[] {
  return db.all<StoredPitch>(
    `SELECT source_record_id AS entSeq, reading, pitch_accent_json AS pitch FROM entries
     WHERE pitch_accent_json IS NOT NULL
     UNION ALL
     SELECT e.source_record_id, e.reading, c.pitch_accent_json FROM compound_pitch.entry_pitch c
     JOIN entries e ON e.id = c.entry_id`
  )
}

describe.runIf(artifactAvailable)('pitch accents on the app’s data', () => {
  let pitches: Map<number, PitchRow>
  let stored: StoredPitch[]

  beforeAll(async () => {
    stored = storedPitches(await artifactDatabase())
    pitches = new Map(stored.map(row => [row.entSeq, JSON.parse(row.pitch) as PitchRow]))
  })

  test('each stored pitch is drawn over as many morae as it counts, and falls by its last', () => {
    const wrong = stored.flatMap(row => {
      const pitch = JSON.parse(row.pitch) as PitchRow
      const drawn = pitchAccent(row.reading, pitch).morae.length
      return drawn === pitch.moraCount && pitch.downstep <= drawn
        ? []
        : [
            `${row.entSeq} ${row.reading}: downstep ${pitch.downstep}, ${pitch.moraCount} morae, ${drawn} drawn`
          ]
    })
    expect(stored.length).toBeGreaterThan(100_000)
    expect(wrong).toEqual([])
  })

  test('a reading UniDic pronounces otherwise keeps only an accent that holds for it', () => {
    expect(pitches.get(konoAida)).toMatchObject({ downstep: 0, moraCount: 5 })
    expect(pitches.has(mochi)).toBe(false)
    expect(pitches.get(mon)).toMatchObject({ downstep: 1, moraCount: 2 })
    expect(pitches.has(seaSerpent)).toBe(false)
  })
})
