// The Example Sentences row's count on the search results screen (SearchView.swift's
// SearchResultsScreen.exampleCount and directExampleCount), and the examples it opens
// (ExampleSentencesView): the primary entry's when the results use them (a romaji or deinflected
// query), otherwise the sentences containing the query.

import { primaryItem } from '../results/results'
import { normalizeQuery } from '../search/query'
import type { SearchResults } from '../search/search'
import type { ArtifactDatabase } from './database'
import { type EntryExamples, retrieveEntryExamples } from './example-retrieval'
import { searchExamples } from './example-search'
import type { ExamplesEntry } from './word-examples'

/**
 * The results' primary entry (`primaryEntry(for:)`), with what linking needs of it; null without
 * results. The Example Sentences screen highlights it for every search, so words written as it
 * link to it, and lists its examples for a romaji or deinflected one.
 */
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

/**
 * The examples the Example Sentences row opens, or null where the app's retrieval throws (it then
 * offers none).
 */
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

/**
 * The Example Sentences row's count: the primary entry's listed examples (at most 100), or the
 * sentences containing the query (`count(_:)`: exact up to 50, then 51).
 */
export function resultsExampleCount(
  usesPrimaryEntryExamples: boolean,
  examples: EntryExamples | null
) {
  if (!examples) return 0
  return usesPrimaryEntryExamples ? examples.sentences.length : examples.count
}
