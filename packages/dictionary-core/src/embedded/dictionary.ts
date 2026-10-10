import { type ArtifactDatabase, type SqlValue, searchDatabase } from '../artifact/database'
import { kanjiCandidateRows } from '../artifact/kanji'
import { kanjiWords } from '../detail/kanji'
import type { LinkEntry } from '../examples/linking'
import { compareRelevance } from '../results/results'
import {
  type SearchDatabase,
  stopIfInterrupted,
  withParametersTruncatedAtNul
} from '../search/database'
import { rankedEnglish } from '../search/english'
import { rankedJapaneseForms } from '../search/japanese'
import type { MorphologyAnalyzer, MorphologyWord } from '../search/morphology'
import { isASCII, normalizeQuery } from '../search/query'
import { matchLabel } from '../search/rank'
import { DictionarySearch, type SearchResultItem, type SearchResults } from '../search/search'

export interface EmbeddedHost {
  all(sql: string, parametersJSON: string): string
  interrupted?(): boolean
}

interface HostRows<Row> {
  rows?: Row[]
  blobs?: string[]
  error?: string
}

function bytes(hex: string): Uint8Array {
  const decoded = new Uint8Array(hex.length / 2)
  for (let index = 0; index < decoded.length; index++) {
    decoded[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return decoded
}

export function hostDatabase(host: EmbeddedHost): ArtifactDatabase {
  return {
    all<Row>(sql: string, params: readonly SqlValue[] = []): Row[] {
      const answer = JSON.parse(host.all(sql, JSON.stringify(params))) as HostRows<
        Record<string, unknown>
      >
      if (!answer.rows) throw new Error(answer.error ?? 'The host returned no rows')
      stopIfInterrupted(host, 0)
      for (const column of answer.blobs ?? []) {
        for (const row of answer.rows) {
          const value = row[column]
          if (typeof value === 'string') row[column] = bytes(value)
        }
      }
      return answer.rows as Row[]
    },
    interrupted: () => host.interrupted?.() ?? false
  }
}

interface EmbeddedSearchItem {
  id: string
  relevance: number
  fallbackOrder: number
  matchedSummary: string | null
  match: string
}

export interface EmbeddedSearchResults extends Omit<SearchResults, 'items'> {
  items: EmbeddedSearchItem[]
}

function relevanceRanks(items: readonly SearchResultItem[]): Map<string, number> {
  const ordered = [...items].sort(compareRelevance)
  const ranks = new Map<string, number>()
  let rank = 0
  for (const [index, item] of ordered.entries()) {
    if (index > 0 && compareRelevance(ordered[index - 1], item) !== 0) rank += 1
    ranks.set(item.entry.id, rank)
  }
  return ranks
}

export class EmbeddedDictionary {
  private readonly db: ArtifactDatabase
  private readonly searchDb: SearchDatabase

  constructor(host: EmbeddedHost) {
    this.db = hostDatabase(host)
    this.searchDb = withParametersTruncatedAtNul(searchDatabase(this.db))
  }

  async search(query: string, morphology: MorphologyAnalyzer): Promise<EmbeddedSearchResults> {
    const results = await new DictionarySearch(this.searchDb, { morphology }).search(query)
    const ranks = relevanceRanks(results.items)
    return {
      ...results,
      items: results.items.map(item => ({
        id: item.entry.id,
        relevance: ranks.get(item.entry.id) ?? 0,
        fallbackOrder: item.fallbackOrder,
        matchedSummary: item.matchedSummary,
        match: matchLabel(item.sourceOrder, item.matchRank)
      }))
    }
  }

  private async entriesMatchingForms(forms: readonly string[]): Promise<Map<string, LinkEntry[]>> {
    const queries = new Map(forms.map(form => [form, normalizeQuery(form)]))
    const japanese = await rankedJapaneseForms(
      this.searchDb,
      [...queries.values()].filter(query => !isASCII(query))
    )
    const found = new Map<string, LinkEntry[]>()
    for (const [form, query] of queries) {
      const ranked = !isASCII(query)
        ? (japanese.get(query) ?? [])
        : query === ''
          ? []
          : await rankedEnglish(this.searchDb, query, true)
      found.set(
        form,
        ranked.map(({ entry: { id, reading, partsOfSpeech } }) => ({ id, reading, partsOfSpeech }))
      )
    }
    return found
  }

  async entriesMatchingFirstForms(
    alternatives: readonly (readonly string[])[]
  ): Promise<Record<string, LinkEntry[]>> {
    const found = new Map<string, LinkEntry[]>()
    let unmatched = alternatives.filter(forms => forms.length > 0)
    while (unmatched.length > 0) {
      const asked = unmatched.map(forms => forms[0]).filter(form => !found.has(form))
      for (const [form, entries] of await this.entriesMatchingForms(asked)) {
        found.set(form, entries)
      }
      unmatched = unmatched
        .filter(forms => found.get(forms[0])?.length === 0)
        .map(forms => forms.slice(1))
        .filter(forms => forms.length > 0)
    }
    return Object.fromEntries(found)
  }

  entriesContainingKanji(character: string): string[] {
    return kanjiWords(character, kanjiCandidateRows(this.db, character)).map(row => row.id)
  }
}

type Outcome = { value: unknown } | { error: string } | { analyze: string }

export interface EmbeddedCall {
  outcome(): string
  analyzed(answerJSON: string): void
}

export interface EmbeddedEndpoint {
  begin(method: string, argument: string): EmbeddedCall
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function embeddedEndpoint(dictionary: EmbeddedDictionary): EmbeddedEndpoint {
  const methods: Record<string, (argument: string, morphology: MorphologyAnalyzer) => unknown> = {
    search: (query, morphology) => dictionary.search(query, morphology),
    entriesMatchingFirstForms: alternatives =>
      dictionary.entriesMatchingFirstForms(JSON.parse(alternatives) as string[][]),
    entriesContainingKanji: character => dictionary.entriesContainingKanji(character),
    normalizeQuery
  }
  return {
    begin(method, argument) {
      const unfinished: Outcome = { error: `${method} did not finish within its call` }
      let outcome: Outcome = unfinished
      let answer: ((answerJSON: string) => void) | undefined
      const morphology: MorphologyAnalyzer = {
        analyze: text =>
          new Promise<MorphologyWord[]>((resolve, reject) => {
            outcome = { analyze: text }
            answer = answerJSON => {
              const { words, error } = JSON.parse(answerJSON) as {
                words?: MorphologyWord[]
                error?: string
              }
              if (words) resolve(words)
              else reject(new Error(error ?? 'The host returned no words'))
            }
          })
      }
      Promise.resolve()
        .then(() => {
          const run = methods[method]
          if (!run) throw new Error(`The core has no ${method}`)
          return run(argument, morphology)
        })
        .then(
          value => {
            outcome = { value }
          },
          error => {
            outcome = { error: message(error) }
          }
        )
      return {
        outcome: () => JSON.stringify(outcome),
        analyzed(answerJSON) {
          const settle = answer
          if (!settle) throw new Error(`${method} is waiting for no analysis`)
          answer = undefined
          outcome = unfinished
          settle(answerJSON)
        }
      }
    }
  }
}
