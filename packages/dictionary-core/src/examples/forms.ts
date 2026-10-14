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
