// The kanji element page, as the app's element screen shows it (KanjiElementDetailView.swift),
// with its entry from KanjiElementLookupClient.swift's `KanjiElementReferenceData.entry(_:)`. The
// words come from the presentation the view shares with the kanji-element-detail conformance
// suite (`KanjiElementSection`, `headerMeanings`, `meaningExplanation`, `soundPatterns`,
// `rowMeanings`, `rowReadings`, and the provenance text).

import type { ElementGlyphRow, ElementKanjiRow, KanjiElementRows } from './rows'
import { isKanjiCharacter } from './text'

/** `KanjiElementSection`, in the order the screen shows them. */
export const elementSections = [
  'alternativeForms',
  'meaningStructure',
  'soundPatterns',
  'standaloneKanji',
  'containingKanji',
  'source'
] as const

export type ElementSection = (typeof elementSections)[number]

/**
 * Each section's title as the app writes it, in capitals; the website shows it in sentence
 * case (`sectionTitle`), as it does the kanji page's element roles.
 */
export const appSectionTitles: Record<ElementSection, string> = {
  alternativeForms: 'ALTERNATIVE FORMS',
  meaningStructure: 'MEANING / STRUCTURE',
  soundPatterns: 'SOUND PATTERNS',
  standaloneKanji: 'AS A STANDALONE KANJI',
  containingKanji: 'KANJI CONTAINING THIS ELEMENT',
  source: 'SOURCE'
}

/** An app section title in sentence case: `KANJI CONTAINING THIS ELEMENT` is "Kanji containing this element". */
export function sectionTitle(appTitle: string): string {
  const lower = appTitle.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** `KanjiContributionRow`: a kanji that opens its kanji page. */
export interface ElementKanji {
  character: string
  /** Up to three meanings (`rowMeanings`); null without any. */
  meanings: string | null
  /** Its on-readings (`rowReadings`); null without any. */
  readings: string | null
}

export interface KanjiElementDetail {
  glyph: string
  /** The meanings under the glyph (`headerMeanings`); null without any. */
  meanings: string | null
  /** The sections the page shows, in order. */
  sections: ElementSection[]
  /** Other forms of the element, each opening its own element page. */
  alternatives: string[]
  /** "This element contributes forms associated with …"; null without meanings. */
  meaningExplanation: string | null
  /** "Linked on-readings: …"; null without any. */
  soundPatterns: string | null
  /** The element as a kanji of its own, when it or an alternative form is one. */
  standaloneKanji: ElementKanji | null
  /** Every kanji containing the element, in the reference's order, except the standalone one. */
  containingKanji: ElementKanji[]
  /** The Source section: the structure's source and the meanings' and readings' source. */
  structureSource: string
  metadataSource: string
  sourceNote: string
  /** Whether search engines may index the page: it has meanings or linked on-readings. */
  indexable: boolean
}

/**
 * Whether search engines may index an element's page: it has meanings or linked on-readings, as a
 * kanji page needs meanings or readings (#465). Every element in the current reference has one.
 */
export function isIndexableElement(
  element: Pick<ElementGlyphRow, 'meanings' | 'commonLinkedOnReadings'>
): boolean {
  return element.meanings.length > 0 || element.commonLinkedOnReadings.length > 0
}

export const elementSourceNote =
  'Both sources are independently normalized into Zenbu Japanese Language Reference Data.'

/**
 * Swift compares Strings by canonical equivalence, so a compatibility ideograph such as U+FA45
 * equals and sorts as its unified form (U+6D77), scalar by scalar.
 */
const swiftKey = (value: string) => Array.from(value.normalize('NFC'), c => c.codePointAt(0) ?? 0)

function swiftCompare(left: string, right: string): number {
  const [a, b] = [swiftKey(left), swiftKey(right)]
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return a.length - b.length
}

const swiftEqual = (left: string, right: string) => swiftCompare(left, right) === 0

/** `contributionPrecedes`: a lower frequency rank first, a ranked kanji before an unranked one, then the character. */
function contributionOrder(left: ElementKanjiRow, right: ElementKanjiRow): number {
  if (left.frequencyRank !== null && right.frequencyRank !== null) {
    if (left.frequencyRank !== right.frequencyRank) return left.frequencyRank - right.frequencyRank
  } else if (left.frequencyRank !== null) {
    return -1
  } else if (right.frequencyRank !== null) {
    return 1
  }
  return swiftCompare(left.character, right.character)
}

function contribution(row: ElementKanjiRow): ElementKanji {
  return {
    character: row.character,
    meanings: row.meanings.length > 0 ? row.meanings.slice(0, 3).join(', ') : null,
    readings: row.onReadings.length > 0 ? row.onReadings.join(', ') : null
  }
}

/**
 * What the element page shows: `KanjiElementReferenceData.entry(_:)` and the view's
 * presentation. The standalone kanji is the first of the element and its alternative forms that
 * the reference lists as a kanji, by frequency rank; it's left out of the kanji containing the
 * element. Only ideographs are kanji here (`KanjiCharacter`).
 */
export function kanjiElementDetail({
  element,
  kanji,
  sources
}: KanjiElementRows): KanjiElementDetail {
  // The reference looks kanji up by exact code point (`glyphKey`).
  const byCharacter = new Map(kanji.map(row => [row.character, row]))
  const lookUp = (character: string) =>
    isKanjiCharacter(character) ? byCharacter.get(character) : undefined
  const family = [element.glyph, ...element.alternatives].flatMap(glyph => lookUp(glyph) ?? [])
  const standalone = [...family].sort(contributionOrder)[0] ?? null
  const containing = element.containingCharacters
    .flatMap(character => lookUp(character) ?? [])
    .filter(row => !standalone || !swiftEqual(row.character, standalone.character))
  const meanings = element.meanings.length > 0 ? element.meanings.join(', ') : null
  const meaningExplanation = meanings
    ? `This element contributes forms associated with ${meanings}.`
    : null
  const soundPatterns =
    element.commonLinkedOnReadings.length > 0
      ? `Linked on-readings: ${element.commonLinkedOnReadings.join(', ')}`
      : null
  const alternatives = element.alternatives.filter(isKanjiCharacter)
  const shown: Record<ElementSection, boolean> = {
    alternativeForms: alternatives.length > 0,
    meaningStructure: meaningExplanation !== null,
    soundPatterns: soundPatterns !== null,
    standaloneKanji: standalone !== null,
    containingKanji: containing.length > 0,
    source: true
  }
  return {
    glyph: element.glyph,
    meanings,
    sections: elementSections.filter(section => shown[section]),
    alternatives,
    meaningExplanation,
    soundPatterns,
    standaloneKanji: standalone ? contribution(standalone) : null,
    containingKanji: containing.map(contribution),
    structureSource: `${sources.structureSourceIdentity} ${sources.snapshot}`,
    metadataSource: `${sources.metadataSourceIdentity} ${sources.metadataSourceSnapshot}`,
    sourceNote: elementSourceNote,
    indexable: isIndexableElement(element)
  }
}

/** With the kanji page it opens; null for a kanji without one. */
export type LinkedElementKanji = ElementKanji & { path: string | null }

/** An element page's detail with each kanji's page. */
export interface LinkedKanjiElementDetail
  extends Omit<KanjiElementDetail, 'standaloneKanji' | 'containingKanji'> {
  standaloneKanji: LinkedElementKanji | null
  containingKanji: LinkedElementKanji[]
}

/** Adds each kanji's page, as data.ts and the rendered-page test both link them. */
export function linkKanjiElement(
  detail: KanjiElementDetail,
  kanjiPath: (character: string) => string | null
): LinkedKanjiElementDetail {
  const link = (kanji: ElementKanji) => ({ ...kanji, path: kanjiPath(kanji.character) })
  return {
    ...detail,
    standaloneKanji: detail.standaloneKanji ? link(detail.standaloneKanji) : null,
    containingKanji: detail.containingKanji.map(link)
  }
}
