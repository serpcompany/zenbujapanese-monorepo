import { groupInflections, type MorphologyCandidate } from './morphology'

export function analyzedWords(candidates: MorphologyCandidate[] | null): string[] {
  return candidates === null ? [] : groupInflections(candidates).map(word => word.surface)
}

export function usesForm(
  japanese: string,
  candidates: MorphologyCandidate[] | null,
  surface: string
): boolean {
  return japanese.includes(surface) && analyzedWords(candidates).includes(surface)
}

function rangesOverlap(start: number, end: number, from: number, to: number): boolean {
  return start < end && from < to && from < end && start < to
}

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
    if (occurrences.some(([from, to]) => rangesOverlap(start, end, from, to))) {
      highlights.push(index)
    }
    start = end
  }
  return highlights
}
