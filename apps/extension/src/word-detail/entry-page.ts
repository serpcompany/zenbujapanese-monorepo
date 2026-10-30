export type EntryPage =
  | { page: 'word'; entSeq: number; entries?: number[] }
  | { page: 'kanji'; character: string }
  | { page: 'form'; form: string }

export type OpenEntry = (page: EntryPage) => void
