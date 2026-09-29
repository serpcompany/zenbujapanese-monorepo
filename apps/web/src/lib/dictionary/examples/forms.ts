// Ports what a conjugated form's screen lists and accents: the filter in `ConjugatedForm.examples`
// (ConjugationsView.swift), with `JapaneseTextAnalysisClient.words`, and the query highlight
// (`LinkedJapaneseText.queryScalarRanges` and `matchesQuery`). The import runs them for every form
// (scripts/release-d1/dictionary/build-examples.mts); the word-detail suite checks the result.
// Change the Swift and this port in the same PR, and re-record the word-detail suite.

import { groupInflections, type MorphologyCandidate } from './morphology'

/**
 * `JapaneseTextAnalysisClient.words`: the text's words as linked text shows them, with
 * inflections joined (見なかった), and none when the analysis fails.
 */
export function analyzedWords(candidates: MorphologyCandidate[] | null): string[] {
  return candidates === null ? [] : groupInflections(candidates).map(word => word.surface)
}

/**
 * Whether a retrieved sentence is one of the form's examples: it contains the form, and the
 * parser reads the form as one whole word, so 見たかった and 見た目 aren't examples of 見た.
 */
export function usesForm(
  japanese: string,
  candidates: MorphologyCandidate[] | null,
  surface: string
): boolean {
  return japanese.includes(surface) && analyzedWords(candidates).includes(surface)
}

/**
 * The tokens the screen accents: each whose Unicode-scalar range overlaps an occurrence of the
 * query in the text (`queryScalarRanges`, `matchesQuery`). The tokens tile the text, in order.
 */
export function queryHighlights(text: string, tokens: readonly string[], query: string): number[] {
  const scalars = Array.from(text)
  const needle = Array.from(query)
  if (tokens.join('') !== text) throw new Error(`The tokens don't tile ${text}`)
  const occurrences: [number, number][] = []
  if (needle.length > 0) {
    for (let start = 0; start + needle.length <= scalars.length; start++) {
      if (needle.every((scalar, index) => scalars[start + index] === scalar)) {
        occurrences.push([start, start + needle.length])
      }
    }
  }
  const highlights: number[] = []
  let start = 0
  for (const [index, token] of tokens.entries()) {
    const end = start + Array.from(token).length
    // Range.overlaps: an empty range overlaps nothing.
    if (end > start && occurrences.some(([from, to]) => from < end && start < to)) {
      highlights.push(index)
    }
    start = end
  }
  return highlights
}
