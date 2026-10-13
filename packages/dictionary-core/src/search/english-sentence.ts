import { type BaseForm, baseFormsOf, irregularBaseFormsOf } from '../examples/english-inflection'
import {
  discoveredWordLimit,
  resultItems,
  type SearchResultItem,
  searchResultLimit
} from './composition'
import type { SearchDatabase } from './database'
import { rankedByStrongGloss } from './english'
import { type FixedEntry, fixedEntries, wordsThatListNothing } from './english-function-words'
import {
  areAlwaysTogether,
  type EntryExamplesUse,
  entriesExamplesUse,
  usedInExamples
} from './english-word-entries'
import { englishSentenceWords } from './query'
import { comparePresentationRanks } from './rank'
import type { RankedEntry } from './ranked-entries'

const sentenceWordLookupLimit = 24

const nounParts: ReadonlySet<string> = new Set(['noun'])

const adjectiveParts: ReadonlySet<string> = new Set([
  'iAdjective',
  'naAdjective',
  'preNounAdjective',
  'taruAdjective'
])

const infinitive = (verb: string) => `to ${verb}`

interface Meaning {
  gloss: string
  partsOfSpeech?: ReadonlySet<string>
}

const asWritten = (gloss: string): Meaning => ({ gloss })

function asTheWordReadsIt({ base, entries }: BaseForm): Meaning {
  switch (entries) {
    case 'verbs':
    case 'allIfAVerb':
      return asWritten(infinitive(base))
    case 'nouns':
      return { gloss: base, partsOfSpeech: nounParts }
    case 'adjectives':
      return { gloss: base, partsOfSpeech: adjectiveParts }
    case 'all':
      return asWritten(base)
  }
}

const isAVerbForm = ({ entries }: BaseForm) => entries === 'verbs' || entries === 'allIfAVerb'

const isAComparative = ({ entries }: BaseForm) => entries === 'adjectives'

const baseFormsOfAnyKind = (word: string) => [...irregularBaseFormsOf(word), ...baseFormsOf(word)]

async function entriesThatMean(
  db: SearchDatabase,
  { gloss, partsOfSpeech }: Meaning
): Promise<RankedEntry[]> {
  const ranked = await rankedByStrongGloss(db, gloss)
  return partsOfSpeech
    ? ranked.filter(({ entry }) => entry.partsOfSpeech.some(part => partsOfSpeech.has(part)))
    : ranked
}

async function firstRowCandidates(
  db: SearchDatabase,
  meaning: Meaning
): Promise<SearchResultItem[]> {
  const ranked = (await entriesThatMean(db, meaning)).slice(0, searchResultLimit)
  return resultItems(
    ranked.filter(
      entry => comparePresentationRanks(entry.presentationRank, ranked[0].presentationRank) === 0
    )
  )
}

type EntriesOfAWord = SearchResultItem[] | undefined

const unknownWord = undefined
const noEntriesOfAKnownWord: SearchResultItem[] = []

const entriesOrUnknownWord = (candidates: SearchResultItem[]): EntriesOfAWord =>
  candidates.length > 0 ? candidates : unknownWord

type ExamplesByWord = ReadonlyMap<string, readonly EntryExamplesUse[]>

async function firstEntryExamplesUse(
  db: SearchDatabase,
  used: readonly EntryExamplesUse[],
  meanings: readonly Meaning[],
  orAlwaysTogether: boolean
): Promise<SearchResultItem[]> {
  const entries: RankedEntry[][] = []
  for (const row of used) {
    for (const [order, meaning] of meanings.entries()) {
      entries[order] ??= await entriesThatMean(db, meaning)
      const found = entries[order].find(ranked => ranked.entry.id === row.id)
      if (found) return resultItems([found])
    }
    if (orAlwaysTogether && areAlwaysTogether(row)) return [usedInExamples(row)]
  }
  return []
}

async function candidatesFromExamples(
  db: SearchDatabase,
  word: string,
  examples: ExamplesByWord
): Promise<SearchResultItem[]> {
  const baseForms = baseFormsOfAnyKind(word)
  const inAnyForm = [word, ...baseForms.map(({ base }) => base)].map(asWritten)
  const own = await firstEntryExamplesUse(db, examples.get(word) ?? [], inAnyForm, true)
  if (own.length > 0) return own
  const ofItsBaseForms: SearchResultItem[] = []
  for (const baseForm of baseForms.filter(form => !isAComparative(form))) {
    const used = examples.get(baseForm.base) ?? []
    const meaning = [asTheWordReadsIt(baseForm)]
    const first = await firstEntryExamplesUse(db, used, meaning, !isAVerbForm(baseForm))
    ofItsBaseForms.push(...first)
  }
  return ofItsBaseForms
}

async function candidatesOfABaseForm(
  db: SearchDatabase,
  baseForm: BaseForm
): Promise<EntriesOfAWord> {
  if (baseForm.entries !== 'allIfAVerb') {
    return entriesOrUnknownWord(await firstRowCandidates(db, asTheWordReadsIt(baseForm)))
  }
  const all = await firstRowCandidates(db, asWritten(baseForm.base))
  if (all.length === 0) return unknownWord
  const asAVerb = await firstRowCandidates(db, asTheWordReadsIt(baseForm))
  return asAVerb.length > 0 ? all : noEntriesOfAKnownWord
}

async function candidatesOfBaseForms(
  db: SearchDatabase,
  baseForms: readonly BaseForm[]
): Promise<EntriesOfAWord> {
  let candidates: EntriesOfAWord = unknownWord
  for (const baseForm of baseForms) {
    const found = await candidatesOfABaseForm(db, baseForm)
    if (found) candidates = [...(candidates ?? []), ...found]
  }
  return candidates
}

async function fixedCandidates(
  db: SearchDatabase,
  { jmdictEntry, meaning }: FixedEntry
): Promise<SearchResultItem[]> {
  const ranked = await rankedByStrongGloss(db, meaning)
  return resultItems(ranked.filter(({ entry }) => entry.sourceRecordId === jmdictEntry))
}

async function candidatesFor(
  db: SearchDatabase,
  word: string,
  examples: ExamplesByWord
): Promise<EntriesOfAWord> {
  if (wordsThatListNothing.has(word)) return noEntriesOfAKnownWord
  const fixed = fixedEntries.get(word)
  if (fixed) return entriesOrUnknownWord(await fixedCandidates(db, fixed))
  const fromExamples = await candidatesFromExamples(db, word, examples)
  if (fromExamples.length > 0) return fromExamples
  const own = await firstRowCandidates(db, asWritten(word))
  const irregular = irregularBaseFormsOf(word)
  if (irregular.length > 0) {
    const ofItsBaseForm = (await candidatesOfBaseForms(db, irregular)) ?? []
    return entriesOrUnknownWord([...own, ...ofItsBaseForm])
  }
  return own.length > 0 ? own : candidatesOfBaseForms(db, baseFormsOf(word))
}

export async function englishSentenceCandidates(
  db: SearchDatabase,
  query: string
): Promise<SearchResultItem[][]> {
  const words = englishSentenceWords(query).slice(0, sentenceWordLookupLimit)
  const examples = await entriesExamplesUse(
    db,
    words.flatMap(word => [word, ...baseFormsOfAnyKind(word).map(({ base }) => base)])
  )
  const listed: SearchResultItem[][] = []
  let knownWords = 0
  for (const word of words) {
    const candidates = await candidatesFor(db, word, examples)
    if (candidates === unknownWord) continue
    knownWords++
    if (candidates.length > 0) listed.push(candidates)
    if (listed.length === discoveredWordLimit) break
  }
  return knownWords > 1 ? listed : []
}
