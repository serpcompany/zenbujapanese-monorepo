import { primaryItem } from '../results/results'
import { normalizeQuery } from '../search/query'
import type { SearchResults } from '../search/search'
import type { ArtifactDatabase } from './database'
import { type EntryExamples, retrieveEntryExamples } from './example-retrieval'
import { searchExamples } from './example-search'
import type { ExamplesEntry } from './word-examples'

export function primaryExamplesEntry(
  db: ArtifactDatabase,
  rawQuery: string,
  results: SearchResults
): ExamplesEntry | null {
  const item = primaryItem(results, normalizeQuery(rawQuery))
  if (!item) return null
  const [row] = db.all<{ written_forms_json: string; reading_forms_json: string }>(
    'SELECT written_forms_json, reading_forms_json FROM entries WHERE id = unhex(?)',
    [item.entry.id]
  )
  if (!row) return null
  const values = (json: string) => (JSON.parse(json) as { value: string }[]).map(form => form.value)
  return {
    id: item.entry.id,
    headword: item.entry.headword,
    reading: item.entry.reading,
    partsOfSpeech: item.entry.partsOfSpeech,
    writtenForms: values(row.written_forms_json),
    readingForms: values(row.reading_forms_json)
  }
}

export function resultsExamples(
  db: ArtifactDatabase,
  rawQuery: string,
  primary: ExamplesEntry | null,
  usesPrimaryEntryExamples: boolean
): EntryExamples | null {
  const found =
    usesPrimaryEntryExamples && primary
      ? retrieveEntryExamples(db, primary)
      : searchExamples(db, rawQuery)
  return typeof found === 'string' ? null : found
}

export function resultsExampleCount(
  usesPrimaryEntryExamples: boolean,
  examples: EntryExamples | null
) {
  if (!examples) return 0
  return usesPrimaryEntryExamples ? examples.sentences.length : examples.count
}
