// What the app's example retrieval for a dictionary entry ranks by (ExampleSentenceData in
// apps/ios/Modules/Sources/SearchExperience/ExampleSentenceClient.swift): its limit, the lexical
// relations and RankTuple order an entry's examples use, and how it normalizes the entry's forms.
// The artifact layer's retrieval (../artifact/example-retrieval.ts) runs the app's queries with
// them. Change the Swift and this port in the same PR, and re-record the word-detail suite; the
// Search parity workflow checks that both change.

import { graphemeCount, graphemes } from '../detail/text'

/** How many examples the app lists at most (`result(matches:)`). */
export const exampleLimit = 100

/** ExampleSentenceLexicalRelation, for the relations an entry's examples use. */
export const LexicalRelation = {
  selectedWrittenForm: 4,
  alternateWrittenForm: 5,
  reading: 6
} as const

/** The entry fields retrieval reads: `ExampleSentenceRetrievalRequest.dictionaryEntry`. */
export interface RetrievalEntry {
  id: string
  headword: string
  reading: string
  writtenForms: string[]
}

/**
 * Why the app's retrieval throws for an entry, so Word Detail shows no examples:
 * `invalidQuery(.missingEntryEvidence)`.
 */
export type RetrievalError = 'missingEntryEvidence'

/** `normalizedEntryEvidence`: NFKC, with whitespace runs collapsed to one space. */
export function normalizedEntryEvidence(value: string): string {
  const words: string[] = []
  let word = ''
  for (const character of graphemes(value.normalize('NFKC'))) {
    if (/^\p{White_Space}/u.test(character)) {
      if (word) words.push(word)
      word = ''
    } else {
      word += character
    }
  }
  if (word) words.push(word)
  return words.join(' ')
}

/** `graphemeRange(of:in:)`'s location: the first occurrence, in graphemes, or null. */
export function graphemePosition(term: string, text: string): number | null {
  const index = text.indexOf(term)
  if (index < 0) return null
  return graphemeCount(text.slice(0, index))
}

interface Ranked {
  relation: number
  position: number
  graphemeCount: number
  pairId: string
}

/** RankTuple's order (English term count is 0 for every entry example). */
export function compareRanks(left: Ranked, right: Ranked): number {
  if (left.relation !== right.relation) return left.relation - right.relation
  if (left.position !== right.position) return left.position - right.position
  if (left.graphemeCount !== right.graphemeCount) return left.graphemeCount - right.graphemeCount
  return left.pairId < right.pairId ? -1 : left.pairId > right.pairId ? 1 : 0
}
