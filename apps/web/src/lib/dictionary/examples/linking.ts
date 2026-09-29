// Ports JapaneseTextAnalyzer (apps/ios/Modules/Sources/SearchExperience/
// JapaneseTextAnalysisClient.swift): which dictionary entry each word of an example sentence links
// to on a word page. A word the page's entry was written with is that entry; any other word is
// looked up by its forms, narrowed by part of speech and reading, and links to its one entry or
// lists its candidates. The import runs it for every example (scripts/release-d1/dictionary/
// build-examples.mts); the word-detail conformance suite checks it.
// Change the Swift and this port in the same PR, and re-record the word-detail suite; the
// Search parity workflow checks that both change (issue 464).

import { isJapaneseOnly, normalizeQuery } from '../search/query'
import { toHiragana, toKatakana } from './kana'
import { groupInflections, type MorphologyCandidate } from './morphology'

/** What linking reads of an entry the lookup returns: the app's deduplicated search result. */
export interface LinkEntry {
  /** The Language Reference ID of the entry's equivalence group (its lowest). */
  id: string
  reading: string
  /** The entry's parts of speech (`parts_of_speech_json`), as PartOfSpeech raw values. */
  partsOfSpeech: string[]
}

/** The page's entry, with the forms the app matches words against. */
export interface HighlightedEntry extends LinkEntry {
  headword: string
  writtenForms: string[]
  readingForms: string[]
}

/**
 * `LookupClient.entriesMatchingForm`: entries with a written or reading form equal to the
 * normalized form, in search order, one per equivalence group.
 */
export type EntriesMatchingForm = (form: string) => LinkEntry[]

/** JapaneseTextToken, with what links and furigana need. */
export interface LinkedToken {
  surface: string
  /** The entry the word links to. */
  entry: LinkEntry | null
  /** Its possible entries; one when `entry` is set. */
  candidates: LinkEntry[]
  /** The parser's reading, in katakana as Kuromoji gives it (the surface when it has none). */
  reading: string
  dictionaryForm: string
  /** The parser's part of speech, most general first; empty when the analysis failed. */
  partOfSpeech: string[]
  /** The form the candidates were found by, when there are any and no highlight chose them. */
  lookupForm: string | null
}

interface Resolution {
  entry: LinkEntry | null
  candidates: LinkEntry[]
  lookupForm: string | null
}

const verbs = new Set([
  'verb',
  'godanVerb',
  'ichidanVerb',
  'suruVerb',
  'kuruVerb',
  'zuruVerb',
  'archaicVerb',
  'auxiliaryVerb'
])
const adjectives = new Set([
  'iAdjective',
  'naAdjective',
  'taruAdjective',
  'archaicAdjective',
  'archaicNaAdjective',
  'auxiliaryAdjective'
])
const nouns = new Set([
  'noun',
  'pronoun',
  'nounPrefix',
  'nounSuffix',
  'noAdjective',
  'prenominal',
  'takesSuru'
])

/** `isCompatible(_:with:)`: whether an entry's part of speech fits the parser's. */
export function isCompatible(part: string, providerPOS: string): boolean {
  switch (providerPOS) {
    case '動詞':
      return verbs.has(part)
    case '形容詞':
    case '形状詞':
      return adjectives.has(part)
    case '名詞':
    case '代名詞':
      return nouns.has(part)
    case '副詞':
      return part === 'adverb' || part === 'adverbTo'
    case '助詞':
      return part === 'particle' || part === 'conjunction'
    case '助動詞':
      return (
        ['auxiliary', 'auxiliaryVerb', 'copula', 'suffix', 'nounSuffix'].includes(part) ||
        adjectives.has(part)
      )
    case '接続詞':
      return part === 'conjunction'
    case '連体詞':
      return part === 'preNounAdjective'
    case '感動詞':
      return part === 'interjection'
    case '接頭辞':
      return part === 'prefix' || part === 'nounPrefix'
    case '接尾辞':
      return part === 'suffix' || part === 'nounSuffix'
    default:
      return true
  }
}

/** `forms(for:preferred:)`: the page entry's forms, which a word matches to be that entry. */
export function highlightedForms(entry: HighlightedEntry, preferred: string): Set<string> {
  return new Set(
    [preferred, entry.headword, entry.reading, ...entry.writtenForms, ...entry.readingForms].filter(
      form => form !== ''
    )
  )
}

/** `lookupForms(for:)`: the forms a word is looked up by, in order. */
export function lookupForms(candidate: MorphologyCandidate): string[] {
  const forms: string[] = []
  const append = (value: string) => {
    if (value !== '' && value !== '*' && !forms.includes(value)) forms.push(value)
  }
  // A joined inflection's surface is never its dictionary form, and it can collide with an
  // unrelated headword: しまった (past of しまう) is also the interjection "darn it!".
  const evidence = candidate.joinsInflection
    ? [candidate.dictionaryForm, candidate.normalizedForm]
    : [candidate.surface, candidate.dictionaryForm, candidate.normalizedForm]
  for (const form of evidence) {
    append(form)
    append(toHiragana(form))
    append(toKatakana(form))
  }
  return forms
}

/** `preferredEntries(_:candidate:matchesSurfaceReading:)`. */
function preferredEntries(
  entries: LinkEntry[],
  candidate: MorphologyCandidate,
  matchesSurfaceReading: boolean
): LinkEntry[] {
  let filtered = entries
  const providerPOS = candidate.partOfSpeech[0]
  if (providerPOS !== undefined) {
    const compatible = filtered.filter(entry =>
      entry.partsOfSpeech.some(part => isCompatible(part, providerPOS))
    )
    if (compatible.length > 0) filtered = compatible
  }
  if (matchesSurfaceReading && candidate.reading !== '' && candidate.reading !== '*') {
    const readingMatches = filtered.filter(entry => toKatakana(entry.reading) === candidate.reading)
    if (readingMatches.length > 0) filtered = readingMatches
  }
  return filtered
}

/** How a word resolves by its own forms, when no page's entry claims it. */
function resolveWord(candidate: MorphologyCandidate, lookup: EntriesMatchingForm): Resolution {
  if (!isJapaneseOnly(normalizeQuery(candidate.surface))) {
    return { entry: null, candidates: [], lookupForm: null }
  }
  for (const form of lookupForms(candidate)) {
    const family = lookup(form)
    if (family.length === 0) continue
    const preferred = preferredEntries(family, candidate, form === candidate.surface)
    const found = preferred.length > 0 ? preferred : family
    return { entry: found.length === 1 ? found[0] : null, candidates: found, lookupForm: form }
  }
  return { entry: null, candidates: [], lookupForm: null }
}

/**
 * Links a sentence's words for one page, from its Kuromoji candidates (null when the app's
 * analysis fails, which shows the sentence as one unlinked word). `lookup` should cache by form,
 * as the app's analyzer does.
 */
export function linkedTokens(
  text: string,
  candidates: MorphologyCandidate[] | null,
  highlighted: { entry: HighlightedEntry; query: string } | null,
  lookup: EntriesMatchingForm
): LinkedToken[] {
  if (candidates === null) {
    return text === ''
      ? []
      : [
          {
            surface: text,
            entry: null,
            candidates: [],
            reading: text,
            dictionaryForm: text,
            partOfSpeech: [],
            lookupForm: null
          }
        ]
  }
  const forms = highlighted ? highlightedForms(highlighted.entry, highlighted.query) : null

  const resolve = (candidate: MorphologyCandidate): Resolution => {
    if (highlighted && forms) {
      const evidence = [candidate.surface, candidate.dictionaryForm, candidate.normalizedForm]
      if (evidence.some(form => forms.has(form))) {
        return { entry: highlighted.entry, candidates: [highlighted.entry], lookupForm: null }
      }
    }
    return resolveWord(candidate, lookup)
  }

  const token = (candidate: MorphologyCandidate, resolution: Resolution): LinkedToken => ({
    surface: candidate.surface,
    entry: resolution.entry,
    candidates: resolution.candidates,
    reading: candidate.reading,
    dictionaryForm: candidate.dictionaryForm,
    partOfSpeech: candidate.partOfSpeech,
    lookupForm: resolution.lookupForm
  })

  const tokens: LinkedToken[] = []
  for (const candidate of groupInflections(candidates)) {
    const resolution = resolve(candidate)
    // A joined word that resolves to nothing falls back to its pieces, when one of them does.
    if (resolution.candidates.length === 0 && candidate.children.length > 1) {
      const children = candidate.children.map(child => token(child, resolve(child)))
      if (children.some(child => child.candidates.length > 0)) {
        tokens.push(...children)
        continue
      }
    }
    tokens.push(token(candidate, resolution))
  }
  return tokens
}

/**
 * LinkedTokenView's `displayReading(for:)`: the furigana over a linked word. The entry's reading
 * when the word is written in one of the entry's forms; otherwise the word's own parsed reading,
 * so an inflected 見なかった gets furigana for 見, not 見る.
 */
export function displayReading(
  token: Pick<LinkedToken, 'surface' | 'reading'>,
  entry: { headword: string; reading: string; writtenForms: string[]; readingForms: string[] }
): string {
  const forms = [entry.headword, ...entry.writtenForms, ...entry.readingForms]
  if (forms.includes(token.surface) || token.reading === '') return entry.reading
  return toHiragana(token.reading)
}

/**
 * A word of a sentence as `linkedTokens` resolves it with no page's entry, with what a page's
 * entry can change: its forms, and the pieces it falls back to when it resolves to nothing.
 * Example search stores these once per sentence (scripts/release-d1/search/build-examples.mts)
 * and links them for the query's entry when its page shows them (`linkPlanned`).
 */
export interface PlannedWord {
  surface: string
  /** The parser's reading, in katakana. */
  reading: string
  dictionaryForm: string
  normalizedForm: string
  /** The parser's part of speech, most general first. */
  partOfSpeech: string[]
  /** Its entries when no page's entry claims it: one when it resolves to one. */
  candidates: LinkEntry[]
  /** Its pieces, each planned, when it resolves to nothing and has more than one. */
  pieces: PlannedWord[] | null
  /** The whole sentence as one word, when the app's analysis fails: never linked. */
  unanalyzed?: true
}

/** A sentence's planned words, from the candidates `linkedTokens` reads. */
export function plannedWords(
  text: string,
  candidates: MorphologyCandidate[] | null,
  lookup: EntriesMatchingForm
): PlannedWord[] {
  if (candidates === null) {
    return text === ''
      ? []
      : [
          {
            surface: text,
            reading: text,
            dictionaryForm: text,
            normalizedForm: text,
            partOfSpeech: [],
            candidates: [],
            pieces: null,
            unanalyzed: true
          }
        ]
  }
  const plan = (candidate: MorphologyCandidate, pieces: boolean): PlannedWord => {
    const { candidates: resolved } = resolveWord(candidate, lookup)
    return {
      surface: candidate.surface,
      reading: candidate.reading,
      dictionaryForm: candidate.dictionaryForm,
      normalizedForm: candidate.normalizedForm,
      partOfSpeech: candidate.partOfSpeech,
      candidates: resolved,
      pieces:
        pieces && resolved.length === 0 && candidate.children.length > 1
          ? candidate.children.map(child => plan(child, false))
          : null
    }
  }
  return groupInflections(candidates).map(candidate => plan(candidate, true))
}

/**
 * `linkedTokens` for a page's entry, from a sentence's planned words: a word written as one of
 * the entry's forms is that entry, and every other word resolves as planned.
 */
export function linkPlanned(
  words: PlannedWord[],
  highlighted: { entry: HighlightedEntry; query: string } | null
): LinkedToken[] {
  const forms = highlighted ? highlightedForms(highlighted.entry, highlighted.query) : null
  const token = (word: PlannedWord): LinkedToken => {
    const claimed =
      !word.unanalyzed &&
      forms !== null &&
      [word.surface, word.dictionaryForm, word.normalizedForm].some(form => forms.has(form))
    const candidates = claimed && highlighted ? [highlighted.entry] : word.candidates
    return {
      surface: word.surface,
      entry: candidates.length === 1 ? candidates[0] : null,
      candidates,
      reading: word.reading,
      dictionaryForm: word.dictionaryForm,
      partOfSpeech: word.partOfSpeech,
      lookupForm: null
    }
  }
  const tokens: LinkedToken[] = []
  for (const word of words) {
    const whole = token(word)
    // A joined word that resolves to nothing falls back to its pieces, when one of them does.
    if (whole.candidates.length === 0 && word.pieces) {
      const pieces = word.pieces.map(token)
      if (pieces.some(piece => piece.candidates.length > 0)) {
        tokens.push(...pieces)
        continue
      }
    }
    tokens.push(whole)
  }
  return tokens
}
