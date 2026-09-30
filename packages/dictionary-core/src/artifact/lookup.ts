// `LookupClient.entriesMatchingForm` on the artifact: `rankedJapanese(_, exactFormOnly: true)`,
// the app's exact-form query (`exactJapaneseCandidateSQL`), ranked and deduplicated by the search
// port. Example linking (../examples/linking.ts) looks every word up with it.

import type { LinkEntry } from '../examples/linking'
import { isASCII, normalizeQuery } from '../search/query'
import { type JapaneseRow, rankJapanese } from '../search/search'
import type { Cache } from './cache'
import type { ArtifactDatabase } from './database'

const exactJapaneseCandidateSQL = `SELECT lower(hex(e.id)) AS id, e.source_record_id, e.headword,
    e.reading, e.summary, e.parts_of_speech_json,
    lower(hex(e.semantic_fingerprint)) AS semantic_fingerprint, f.form, f.kind,
    (SELECT count(*) FROM canonical_senses s WHERE s.entry_id = e.id) AS sense_count,
    p.primary_mask, p.secondary_mask, p.news_frequency_band
  FROM forms f
  JOIN entries e ON e.id = f.entry_id
  LEFT JOIN form_priority_profiles p
    ON p.entry_id = f.entry_id AND p.form = f.form AND p.kind = f.kind
  WHERE f.kind IN (0, 1)
    AND f.form = ?
    AND (
      f.kind != 1
      OR NOT EXISTS (
        SELECT 1 FROM reading_form_restrictions r
        WHERE r.entry_id = f.entry_id AND r.reading = f.form
      )
      OR EXISTS (
        SELECT 1 FROM reading_form_restrictions r
        WHERE r.entry_id = f.entry_id AND r.reading = f.form AND r.written_form = e.headword
      )
    )`

/** Looks a form up, remembering each form's entries, as the app's analyzer caches them. */
export type FormLookup = (form: string) => LinkEntry[]

/**
 * The entries with a written or reading form equal to the normalized form, in search order, one
 * per equivalence group: the leading entry's reading and parts of speech, under its group's
 * lowest ID. The app looks an ASCII form up in English, which linking doesn't port; such a form
 * finds nothing here, and the conformance suites would show a word the app links differently.
 */
export function formLookup(
  db: ArtifactDatabase,
  cache: Cache<string, LinkEntry[]> = new Map()
): FormLookup {
  return form => {
    const cached = cache.get(form)
    if (cached) return cached
    const query = normalizeQuery(form)
    const entries =
      query === '' || isASCII(query)
        ? []
        : rankJapanese(query, db.all<JapaneseRow>(exactJapaneseCandidateSQL, [query])).map(
            ({ entry }) => ({
              id: entry.id,
              reading: entry.reading,
              partsOfSpeech: entry.partsOfSpeech
            })
          )
    cache.set(form, entries)
    return entries
  }
}
