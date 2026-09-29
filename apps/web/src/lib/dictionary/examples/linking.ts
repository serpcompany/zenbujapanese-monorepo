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

  const token = (candidate: MorphologyCandidate, resolution: Resolution): LinkedToken => ({
    surface: candidate.surface,
    entry: resolution.entry,
    candidates: resolution.candidates,
    reading: candidate.reading,
    dictionaryForm: candidate.dictionaryForm,
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
