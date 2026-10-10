import { type ArtifactDatabase, searchDatabase } from '../artifact/database'
import { kanjiCandidateRows } from '../artifact/kanji'
import { kanjiWords } from '../detail/kanji'
import type { LinkEntry } from '../examples/linking'
import { type ListedItem, type ListedResults, listedResults, primaryItem } from '../results/results'
import { type SearchDatabase, withParametersTruncatedAtNul } from '../search/database'
import { rankedEnglish } from '../search/english'
import { rankedJapaneseForms } from '../search/japanese'
import type { MorphologyAnalyzer } from '../search/morphology'
import { isASCII, normalizeQuery } from '../search/query'
import { matchLabel } from '../search/rank'
import { DictionarySearch, type SearchResults } from '../search/search'
import { type EmbeddedHost, hostDatabase } from './host'

export interface EmbeddedSearchResults extends ListedResults {
  items: (ListedItem & { match: string })[]
  resolution: SearchResults['resolution']
  primaryEntry: string | null
}

export async function entriesMatchingFirstForms(
  db: SearchDatabase,
  alternatives: readonly (readonly string[])[],
  found: {
    get(form: string): LinkEntry[] | undefined
    set(form: string, entries: LinkEntry[]): unknown
  }
): Promise<void> {
  let unmatched = alternatives.filter(forms => forms.length > 0)
  while (unmatched.length > 0) {
    const asked = [...new Set(unmatched.map(forms => forms[0]))].filter(
      form => found.get(form) === undefined
    )
    const queries = new Map(asked.map(form => [form, normalizeQuery(form)]))
    const japanese = await rankedJapaneseForms(
      db,
      [...queries.values()].filter(query => !isASCII(query))
    )
    for (const [form, query] of queries) {
      const ranked = !isASCII(query)
        ? (japanese.get(query) ?? [])
        : query === ''
          ? []
          : await rankedEnglish(db, query, true)
      found.set(
        form,
        ranked.map(({ entry: { id, reading, partsOfSpeech } }) => ({ id, reading, partsOfSpeech }))
      )
    }
    unmatched = unmatched
      .filter(forms => found.get(forms[0])?.length === 0)
      .map(forms => forms.slice(1))
      .filter(forms => forms.length > 0)
  }
}

export class EmbeddedLookup {
  private readonly db: ArtifactDatabase
  private readonly searchDb: SearchDatabase

  constructor(host: EmbeddedHost) {
    this.db = hostDatabase(host)
    this.searchDb = withParametersTruncatedAtNul(searchDatabase(this.db))
  }

  async search(query: string, morphology: MorphologyAnalyzer): Promise<EmbeddedSearchResults> {
    const results = await new DictionarySearch(this.searchDb, { morphology }).search(query)
    const listed = listedResults(results)
    return {
      ...listed,
      items: listed.items.map((item, index) => ({
        ...item,
        match: matchLabel(results.items[index].sourceOrder, results.items[index].matchRank)
      })),
      resolution: results.resolution,
      primaryEntry: primaryItem(results, query)?.entry.id ?? null
    }
  }

  async entriesMatchingFirstForms(
    alternatives: readonly (readonly string[])[]
  ): Promise<Record<string, LinkEntry[]>> {
    const found = new Map<string, LinkEntry[]>()
    await entriesMatchingFirstForms(this.searchDb, alternatives, found)
    return Object.fromEntries(found)
  }

  entriesContainingKanji(character: string): string[] {
    return kanjiWords(character, kanjiCandidateRows(this.db, character)).map(row => row.id)
  }
}
