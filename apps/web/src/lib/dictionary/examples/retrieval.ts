// Ports the app's example retrieval for a dictionary entry (ExampleSentenceData.retrieveEntry and
// retrieveIndexedEntry in apps/ios/Modules/Sources/SearchExperience/ExampleSentenceClient.swift):
// which Tatoeba sentences a word page lists, in which order, and the count the app reports.
//
// The app scans every sentence per entry (`instr(japanese, ?)`), which would take days for
// 218,382 entries. The import instead finds every sentence each term occurs in once
// (scripts/release-d1/dictionary/build-examples.ts) and hands this code each term's occurrences
// in rank order. The ranking, the tiers, and the rules are the app's, unchanged;
// `retrieveEntryExamplesByScan` is the app's scan, kept to check the fast path against.

import { graphemes } from '../detail/text'

/** How many examples the app lists at most (`result(matches:)`). */
export const exampleLimit = 100

/** ExampleSentenceLexicalRelation, for the relations an entry's examples use. */
export const LexicalRelation = {
  selectedWrittenForm: 4,
  alternateWrittenForm: 5,
  reading: 6
} as const

/** A sentence, by its index in the corpus. */
export interface CorpusSentence {
  /** The pair ID's 16 bytes as lowercase hex; the app's ID is `esp1_` and this. */
  pairId: string
  japanese: string
  /** `japanese.count`: its grapheme clusters. */
  graphemeCount: number
}

/** Where a term first occurs in a sentence (`graphemeRange(of:in:)`'s location). */
export interface Occurrence {
  sentence: number
  /** In grapheme clusters. */
  position: number
}

/**
 * A term's occurrences, in rank order within one relation: by position, then sentence length in
 * graphemes, then pair ID. `total` counts every sentence the term occurs in; `occurrences` may
 * hold only the first of them (see `occurrencesNeeded`).
 */
export interface TermOccurrences {
  occurrences: Occurrence[]
  total: number
}

/**
 * How many of a term's occurrences the retrieval can read: a tier starts after at most 100
 * examples from earlier tiers, and stops once it knows of 101 (more than the limit), so no more
 * than 201 of any one term's sentences are ever reached.
 */
export const occurrencesNeeded = 2 * exampleLimit + 1

/** The entry's forms in the artifact (`entryEvidence(id:)`): written and reading, unnormalized. */
export interface EntryEvidence {
  reading: string
  writtenForms: Set<string>
  readingForms: Set<string>
}

export interface ExampleCorpus {
  sentences: CorpusSentence[]
  /** `entryEvidence(id:)`'s forms, or null when the entry has none. */
  evidence(id: string): EntryEvidence | null
  /** `unambiguousEntryCount`: entries with this written form and this reading form. */
  unambiguousEntryCount(selectedForm: string, reading: string): number
  /** A term's occurrences in rank order (`TermOccurrences`). */
  occurrences(term: string): TermOccurrences
  /**
   * ExampleWordIndex's sentences for the entry, with the surface the index recorded, or null
   * without an index.
   */
  indexedSentences(id: string): { sentence: number; surface: string }[] | null
}

/** The entry fields retrieval reads: `ExampleSentenceRetrievalRequest.dictionaryEntry`. */
export interface RetrievalEntry {
  id: string
  headword: string
  reading: string
  writtenForms: string[]
}

export interface RetrievedExamples {
  /** Sentence indexes in the app's order, at most 100. */
  sentences: number[]
  /** `ExampleSentenceResultCount`: the exact count up to 50; 51 means more than 50. */
  count: number
  /** Whether more than 100 matched, so some aren't listed. */
  truncated: boolean
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
  return graphemes(text.slice(0, index)).length
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

/** Orders a term's occurrences for `TermOccurrences`. */
export function compareOccurrences(sentences: CorpusSentence[]) {
  return (left: Occurrence, right: Occurrence): number =>
    left.position - right.position ||
    sentences[left.sentence].graphemeCount - sentences[right.sentence].graphemeCount ||
    (sentences[left.sentence].pairId < sentences[right.sentence].pairId ? -1 : 1)
}

/** `result(matches:)`: the first 100, with the count the app reports. */
function result(sentences: number[], total: number): RetrievedExamples {
  return {
    sentences: sentences.slice(0, exampleLimit),
    count: total > 50 ? 51 : total,
    truncated: total > exampleLimit
  }
}

export interface EntryTerms {
  selectedForm: string
  alternateForms: string[]
  reading: string
}

/**
 * The guards and terms of `retrieveEntry`, shared by the fast path and the scan: an error, an
 * indexed (kana headword) entry, no examples for an ambiguous form, or the terms to match.
 */
export function entryTerms(
  entry: RetrievalEntry,
  corpus: Pick<ExampleCorpus, 'evidence' | 'unambiguousEntryCount'>
): RetrievalError | 'indexed' | 'ambiguous' | EntryTerms {
  const selectedForm = normalizedEntryEvidence(entry.headword)
  const reading = normalizedEntryEvidence(entry.reading)
  if (entry.id === '' || selectedForm === '' || reading === '') return 'missingEntryEvidence'
  const evidence = corpus.evidence(entry.id)
  // The stored reading must be one of the entry's reading forms.
  if (!evidence || !evidence.readingForms.has(evidence.reading)) return 'missingEntryEvidence'
  if (evidence.reading !== reading) return 'missingEntryEvidence'
  // A kana headword such as でも also occurs inside other words (いつでも, 何でも), so its
  // examples come from sentences Tatoeba's word index links to the entry.
  if (selectedForm === reading) return 'indexed'
  if (!evidence.writtenForms.has(selectedForm)) return 'missingEntryEvidence'
  if (corpus.unambiguousEntryCount(selectedForm, reading) !== 1) return 'ambiguous'
  const alternateForms = entry.writtenForms
    .map(normalizedEntryEvidence)
    .filter(form => form !== selectedForm && evidence.writtenForms.has(form))
  return { selectedForm, alternateForms: [...new Set(alternateForms)], reading }
}

/** `retrieveIndexedEntry`: a kana headword's sentences from ExampleWordIndex. */
function retrieveIndexedEntry(
  entry: RetrievalEntry,
  selectedForm: string,
  corpus: ExampleCorpus
): RetrievedExamples {
  const indexed = corpus.indexedSentences(entry.id)
  if (indexed === null) return result([], 0)
  const matches: (Ranked & { sentence: number })[] = []
  for (const { sentence, surface } of indexed) {
    const { japanese, graphemeCount, pairId } = corpus.sentences[sentence]
    const term = normalizedEntryEvidence(surface)
    const position = graphemePosition(term, japanese)
    if (position === null) continue
    const relation =
      term === selectedForm ? LexicalRelation.selectedWrittenForm : LexicalRelation.reading
    matches.push({ sentence, relation, position, graphemeCount, pairId })
  }
  matches.sort(compareRanks)
  return result(
    matches.map(match => match.sentence),
    matches.length
  )
}

/**
 * The examples a word page lists for an entry: `retrieveEntry` for a written headword, whose
 * sentences contain its selected form, then its other written forms, then its reading, each tier
 * by where the form first occurs; `retrieveIndexedEntry` for a kana headword.
 */
export function retrieveEntryExamples(
  entry: RetrievalEntry,
  corpus: ExampleCorpus
): RetrievedExamples | RetrievalError {
  const terms = entryTerms(entry, corpus)
  if (terms === 'missingEntryEvidence') return terms
  if (terms === 'ambiguous') return result([], 0)
  if (terms === 'indexed') {
    return retrieveIndexedEntry(entry, normalizedEntryEvidence(entry.headword), corpus)
  }

  // Each sentence ranks by its best (relation, position): the selected form's tier, then the
  // alternate forms', then the reading's. Within a tier, occurrences come in rank order, so
  // merging the tier's terms and skipping sentences already listed yields the app's order.
  const listed: number[] = []
  const seen = new Set<number>()
  // Every sentence any term occurs in: when no term's occurrences were cut short, this is exact.
  const all = new Set<number>()
  let complete = true
  const tiers = [[terms.selectedForm], terms.alternateForms, [terms.reading]]
  for (const tier of tiers) {
    const lists = tier.map(term => corpus.occurrences(term))
    for (const list of lists) {
      if (list.occurrences.length < list.total) complete = false
      for (const occurrence of list.occurrences) all.add(occurrence.sentence)
    }
    const cursors = lists.map(() => 0)
    const order = compareOccurrences(corpus.sentences)
    while (listed.length <= exampleLimit) {
      let best = -1
      for (const [index, list] of lists.entries()) {
        const occurrence = list.occurrences[cursors[index]]
        if (occurrence === undefined) {
          // A list cut short must never run out before the retrieval stops (occurrencesNeeded).
          if (list.occurrences.length < list.total) {
            throw new Error(`Needed more than ${list.occurrences.length} occurrences of a term`)
          }
          continue
        }
        if (best < 0 || order(occurrence, lists[best].occurrences[cursors[best]]) < 0) best = index
      }
      if (best < 0) break
      const { sentence } = lists[best].occurrences[cursors[best]]
      cursors[best] += 1
      if (seen.has(sentence)) continue
      seen.add(sentence)
      listed.push(sentence)
    }
    if (listed.length > exampleLimit) break
  }
  // More than 100 listed means more than 100 matched; otherwise every match was listed, or some
  // term had more occurrences than were kept, which alone is more than 100.
  const total =
    listed.length > exampleLimit || !complete ? Math.max(listed.length, exampleLimit + 1) : all.size
  return result(listed, total)
}

/**
 * The app's `retrieveEntry` as written: every sentence containing any term, each ranked by its
 * best evidence, sorted. Too slow for the import; tests and the import's self-check compare it
 * with `retrieveEntryExamples`.
 */
export function retrieveEntryExamplesByScan(
  entry: RetrievalEntry,
  corpus: ExampleCorpus
): RetrievedExamples | RetrievalError {
  const terms = entryTerms(entry, corpus)
  if (terms === 'missingEntryEvidence') return terms
  if (terms === 'ambiguous') return result([], 0)
  if (terms === 'indexed') {
    return retrieveIndexedEntry(entry, normalizedEntryEvidence(entry.headword), corpus)
  }
  const matches: (Ranked & { sentence: number })[] = []
  for (const [sentence, { japanese, graphemeCount, pairId }] of corpus.sentences.entries()) {
    const evidence: { relation: number; position: number }[] = []
    const add = (term: string, relation: number) => {
      const position = graphemePosition(term, japanese)
      if (position !== null) evidence.push({ relation, position })
    }
    add(terms.selectedForm, LexicalRelation.selectedWrittenForm)
    for (const form of terms.alternateForms) add(form, LexicalRelation.alternateWrittenForm)
    add(terms.reading, LexicalRelation.reading)
    if (evidence.length === 0) continue
    const best = evidence.reduce((min, next) =>
      next.relation < min.relation ||
      (next.relation === min.relation && next.position < min.position)
        ? next
        : min
    )
    matches.push({ sentence, ...best, graphemeCount, pairId })
  }
  matches.sort(compareRanks)
  return result(
    matches.map(match => match.sentence),
    matches.length
  )
}

/**
 * Every sentence each term occurs in, with where it first occurs, found in one pass over the
 * corpus: each position is extended only while the text so far is the start of some term.
 * Returns each term's occurrences in rank order, keeping the first `occurrencesNeeded`.
 */
export function findOccurrences(
  sentences: CorpusSentence[],
  terms: Iterable<string>
): Map<string, TermOccurrences> {
  const termIds = new Map<string, number>()
  const prefixes = new Set<string>()
  for (const term of terms) {
    if (term === '' || termIds.has(term)) continue
    termIds.set(term, termIds.size)
    for (let end = 1; end < term.length; end++) prefixes.add(term.slice(0, end))
  }
  const found: Occurrence[][] = Array.from({ length: termIds.size }, () => [])
  for (const [index, { japanese }] of sentences.entries()) {
    // Grapheme positions of UTF-16 offsets, for the few sentences where they differ.
    let positions: number[] | null = null
    const clusters = graphemes(japanese)
    if (clusters.length !== japanese.length) {
      positions = []
      for (const [position, cluster] of clusters.entries()) {
        for (let unit = 0; unit < cluster.length; unit++) positions.push(position)
      }
    }
    const seen = new Set<number>()
    for (let start = 0; start < japanese.length; start++) {
      for (let end = start + 1; end <= japanese.length; end++) {
        const text = japanese.slice(start, end)
        const id = termIds.get(text)
        if (id !== undefined && !seen.has(id)) {
          seen.add(id)
          found[id].push({ sentence: index, position: positions ? positions[start] : start })
        }
        if (!prefixes.has(text)) break
      }
    }
  }
  const order = compareOccurrences(sentences)
  const result = new Map<string, TermOccurrences>()
  for (const [term, id] of termIds) {
    const occurrences = found[id]
    const total = occurrences.length
    occurrences.sort(order)
    result.set(term, { occurrences: occurrences.slice(0, occurrencesNeeded), total })
    found[id] = []
  }
  return result
}
