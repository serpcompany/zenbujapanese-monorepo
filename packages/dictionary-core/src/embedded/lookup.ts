import { type ArtifactDatabase, searchDatabase } from '../artifact/database'
import { kanjiCandidateRows } from '../artifact/kanji'
import { jmdictSource } from '../artifact/words'
import { kanjiWords } from '../detail/kanji'
import { type WebsitePage, websitePage } from '../detail/links'
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

export type WebsiteRoute = Exclude<WebsitePage, { kind: 'word' }> | { kind: 'word'; id: string }

interface WrittenWord {
  headword: string
  reading: string
}

const sameText = (left: string, right: string) => left.normalize('NFC') === right.normalize('NFC')

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

  websiteRoute(link: { host: string | null; path: string }): WebsiteRoute {
    const page = websitePage(link.host, link.path)
    if (page.kind !== 'word') return page
    const [entry] = this.db.all<{ id: string }>(
      `SELECT lower(hex(id)) AS id FROM entries
       WHERE source_identity = ? AND source_record_id = ?`,
      [jmdictSource, page.entSeq]
    )
    if (entry) return { kind: 'word', id: entry.id }
    return page.slug === '' ? { kind: 'home' } : { kind: 'search', query: page.slug }
  }

  private async found(
    query: string,
    word: WrittenWord,
    morphology: MorphologyAnalyzer
  ): Promise<{ written: string | null; first: string | null }> {
    const { items } = await new DictionarySearch(this.searchDb, { morphology }).search(query)
    const written = items.find(
      ({ entry }) =>
        sameText(entry.headword, word.headword) && sameText(entry.reading, word.reading)
    )
    return { written: written?.entry.id ?? null, first: items[0]?.entry.id ?? null }
  }

  async relatedWord(
    related: WrittenWord & { targetID: string | null; query: string },
    morphology: MorphologyAnalyzer
  ): Promise<string | null> {
    if (related.targetID !== null) return related.targetID
    const { written, first } = await this.found(related.query, related, morphology)
    return written ?? first
  }

  async savedWord(
    saved: WrittenWord & { id: string },
    morphology: MorphologyAnalyzer
  ): Promise<string | null> {
    const [stored] = this.db.all<{ id: string }>(
      'SELECT lower(hex(id)) AS id FROM entries WHERE id = unhex(?)',
      [saved.id]
    )
    if (stored) return saved.id
    return (await this.found(saved.headword, saved, morphology)).written
  }
}
