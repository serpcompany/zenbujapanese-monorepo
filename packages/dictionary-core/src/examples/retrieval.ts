import { graphemeCount, graphemes } from '../detail/text'

export const exampleLimit = 100

export const exactExampleCountLimit = 50

export function reportedExampleCount(matches: number): number {
  return matches > exactExampleCountLimit ? exactExampleCountLimit + 1 : matches
}

export const LexicalRelation = {
  selectedWrittenForm: 4,
  alternateWrittenForm: 5,
  reading: 6
} as const

export interface RetrievalEntry {
  id: string
  headword: string
  reading: string
  writtenForms: string[]
}

export type RetrievalError = 'missingEntryEvidence'

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

export function compareRanks(left: Ranked, right: Ranked): number {
  if (left.relation !== right.relation) return left.relation - right.relation
  if (left.position !== right.position) return left.position - right.position
  if (left.graphemeCount !== right.graphemeCount) return left.graphemeCount - right.graphemeCount
  return left.pairId < right.pairId ? -1 : left.pairId > right.pairId ? 1 : 0
}
