import type { FrequencyRow } from '../detail/rows'

export function frequencyQueries(ids: readonly string[]) {
  const placeholders = ids.map(() => 'unhex(?)').join(', ')
  return {
    levels: `SELECT lower(hex(language_reference_id)) AS id, level FROM jlpt.level_evidence
      WHERE language_reference_id IN (${placeholders})`,
    ranks: `SELECT lower(hex(language_reference_id)) AS id, rank FROM tubelex.frequency_evidence
      WHERE language_reference_id IN (${placeholders})`,
    params: [...ids]
  }
}

export function frequencyByEntry(
  levels: readonly { id: string; level: number }[],
  ranks: readonly { id: string; rank: number }[]
): Map<string, FrequencyRow[]> {
  const frequency = new Map<string, FrequencyRow[]>()
  const add = (id: string, row: FrequencyRow) =>
    frequency.set(id, [...(frequency.get(id) ?? []), row])
  for (const { id, level } of levels) add(id, { pack: 'jlpt', level })
  for (const { id, rank } of ranks) add(id, { pack: 'tubelex', rank })
  return frequency
}
