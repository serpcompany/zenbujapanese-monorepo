import { wordSlug } from './slug'

export interface LinkedWord {
  headword: string
  reading: string
  entSeq: number
}

export function wordPath(entry: LinkedWord): string {
  return `/dictionary/${wordSlug(entry.headword, entry.reading)}-${entry.entSeq}/`
}
