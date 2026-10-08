import type { FrequencyRow } from '../detail/rows'
import { listedIds } from './database'

function evidenceQueries(idsIn: string, params: string[]) {
  return {
    levels: `SELECT lower(hex(language_reference_id)) AS id, level FROM jlpt.level_evidence
      WHERE language_reference_id IN (${idsIn})`,
    ranks: `SELECT lower(hex(language_reference_id)) AS id, rank FROM tubelex.frequency_evidence
      WHERE language_reference_id IN (${idsIn})`,
    params
  }
}

export function frequencyQueries(ids: readonly string[]) {
  return evidenceQueries(ids.map(() => 'unhex(?)').join(', '), [...ids])
}

export function listedFrequencyQueries(ids: readonly string[]) {
  return evidenceQueries(listedIds, [JSON.stringify(ids)])
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
