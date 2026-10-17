import { isJapaneseOnly, normalizeQuery } from '../search/query'
import { toHiragana, toKatakana } from './kana'
import { groupInflections, type MorphologyCandidate } from './morphology'

export interface LinkEntry {
  id: string
  reading: string
  partsOfSpeech: string[]
}

export interface HighlightedEntry extends LinkEntry {
  headword: string
  writtenForms: string[]
  readingForms: string[]
}

export type EntriesMatchingForm = (form: string) => LinkEntry[]

export interface LinkedToken {
  surface: string
  entry: LinkEntry | null
  candidates: LinkEntry[]
  reading: string
  dictionaryForm: string
  partOfSpeech: string[]
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

interface Highlighted {
  entry: HighlightedEntry
  query: string
}

function highlightedForms({ entry, query }: Highlighted): Set<string> {
  const forms = new Set<string>()
  for (const form of [
    query,
    entry.headword,
    entry.reading,
    ...entry.writtenForms,
    ...entry.readingForms
  ]) {
    if (form !== '') forms.add(form).add(form.normalize('NFKC'))
  }
  return forms
}

function isWrittenAs(candidate: MorphologyCandidate, forms: Set<string> | null): boolean {
  if (!forms) return false
  return [candidate.surface, candidate.dictionaryForm, candidate.normalizedForm].some(
    form => forms.has(form) || forms.has(form.normalize('NFKC'))
  )
}

function remembered<Key extends object, Value>(compute: (key: Key) => Value): (key: Key) => Value {
  const known = new WeakMap<Key, Value>()
  return key => {
    let value = known.get(key)
    if (value === undefined) {
      value = compute(key)
      known.set(key, value)
    }
    return value
  }
}

const grouped = remembered(groupInflections)

const isLookedUp = remembered((candidate: MorphologyCandidate) =>
  isJapaneseOnly(normalizeQuery(candidate.surface))
)

export const lookupForms = remembered(formsToLookUp)

function formsToLookUp(candidate: MorphologyCandidate): string[] {
  const forms: string[] = []
  const append = (value: string) => {
    if (value !== '' && value !== '*' && !forms.includes(value)) forms.push(value)
  }
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

function hasCompatiblePart(entry: LinkEntry, providerPOS: string): boolean {
  for (const part of entry.partsOfSpeech) {
    if (isCompatible(part, providerPOS)) return true
  }
  return false
}

function preferredEntries(
  entries: LinkEntry[],
  candidate: MorphologyCandidate,
  matchesSurfaceReading: boolean
): LinkEntry[] {
  let filtered = entries
  const providerPOS = candidate.partOfSpeech[0]
  if (providerPOS !== undefined) {
    const compatible: LinkEntry[] = []
    for (const entry of filtered) {
      if (hasCompatiblePart(entry, providerPOS)) compatible.push(entry)
    }
    if (compatible.length > 0) filtered = compatible
  }
  if (matchesSurfaceReading && candidate.reading !== '' && candidate.reading !== '*') {
    const readingMatches: LinkEntry[] = []
    for (const entry of filtered) {
      if (toKatakana(entry.reading) === candidate.reading) readingMatches.push(entry)
    }
    if (readingMatches.length > 0) filtered = readingMatches
  }
  return filtered
}

export function formsLookedUp(
  candidates: MorphologyCandidate[],
  highlighted: Highlighted | null
): string[][] {
  const forms = highlighted ? highlightedForms(highlighted) : null
  return grouped(candidates)
    .filter(candidate => !isWrittenAs(candidate, forms) && isLookedUp(candidate))
    .map(lookupForms)
}

export function linkedTokens(
  text: string,
  candidates: MorphologyCandidate[] | null,
  highlighted: Highlighted | null,
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
  const forms = highlighted ? highlightedForms(highlighted) : null

  const resolve = (candidate: MorphologyCandidate): Resolution => {
    if (highlighted && isWrittenAs(candidate, forms)) {
      return { entry: highlighted.entry, candidates: [highlighted.entry], lookupForm: null }
    }
    if (!isLookedUp(candidate)) {
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
    partOfSpeech: candidate.partOfSpeech,
    lookupForm: resolution.lookupForm
  })

  const tokens: LinkedToken[] = []
  for (const candidate of grouped(candidates)) {
    const resolution = resolve(candidate)
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

export function displayReading(
  token: Pick<LinkedToken, 'surface' | 'reading'>,
  entry: { headword: string; reading: string; writtenForms: string[]; readingForms: string[] }
): string {
  const forms = [entry.headword, ...entry.writtenForms, ...entry.readingForms]
  if (forms.includes(token.surface) || token.reading === '') return entry.reading
  return toHiragana(token.reading)
}
