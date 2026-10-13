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
import { englishSentenceWords } from './query'
import { comparePresentationRanks } from './rank'

const sentenceWordLookupLimit = 24

const nounParts: ReadonlySet<string> = new Set(['noun'])

const adjectiveParts: ReadonlySet<string> = new Set([
  'iAdjective',
  'naAdjective',
  'preNounAdjective',
  'taruAdjective'
])

const infinitive = (verb: string) => `to ${verb}`

async function firstRowCandidates(
  db: SearchDatabase,
  meaning: string,
  partsOfSpeech?: ReadonlySet<string>
): Promise<SearchResultItem[]> {
  const ranked = (await rankedByStrongGloss(db, meaning))
    .filter(
      ({ entry }) => !partsOfSpeech || entry.partsOfSpeech.some(part => partsOfSpeech.has(part))
    )
    .slice(0, searchResultLimit)
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

async function candidatesOfABaseForm(
  db: SearchDatabase,
  { base, entries }: BaseForm
): Promise<EntriesOfAWord> {
  switch (entries) {
    case 'verbs':
      return entriesOrUnknownWord(await firstRowCandidates(db, infinitive(base)))
    case 'nouns':
      return entriesOrUnknownWord(await firstRowCandidates(db, base, nounParts))
    case 'adjectives':
      return entriesOrUnknownWord(await firstRowCandidates(db, base, adjectiveParts))
    case 'all':
      return entriesOrUnknownWord(await firstRowCandidates(db, base))
    case 'allIfAVerb': {
      const all = await firstRowCandidates(db, base)
      if (all.length === 0) return unknownWord
      const asAVerb = await firstRowCandidates(db, infinitive(base))
      return asAVerb.length > 0 ? all : noEntriesOfAKnownWord
    }
  }
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

async function candidatesFor(db: SearchDatabase, word: string): Promise<EntriesOfAWord> {
  if (wordsThatListNothing.has(word)) return noEntriesOfAKnownWord
  const fixed = fixedEntries.get(word)
  if (fixed) return entriesOrUnknownWord(await fixedCandidates(db, fixed))
  const own = await firstRowCandidates(db, word)
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
  const listed: SearchResultItem[][] = []
  let knownWords = 0
  for (const word of englishSentenceWords(query).slice(0, sentenceWordLookupLimit)) {
    const candidates = await candidatesFor(db, word)
    if (candidates === unknownWord) continue
    knownWords++
    if (candidates.length > 0) listed.push(candidates)
    if (listed.length === discoveredWordLimit) break
  }
  return knownWords > 1 ? listed : []
}
