// Entries' evidence in the default frequency dictionaries, from the artifact's attached packs
// (`jlpt` and `tubelex`, ./database.ts), in the app's catalog order (FrequencyPackCatalog.json):
// JLPT levels, then TUBELEX ranks.

import type { FrequencyRow } from '../detail/rows'

/** The two queries, for `ids` (lowercase hex Language Reference IDs), with their parameters. */
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

/** Each entry's rows, in catalog order. */
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
