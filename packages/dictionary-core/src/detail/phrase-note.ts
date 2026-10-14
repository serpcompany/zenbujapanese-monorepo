import { graphemeCount } from './text'

export interface PhraseEntry {
  meanings: readonly string[]
  partsOfSpeech: readonly string[]
}

const setPhraseLength = 4
const meaningsPerNote = 3

function isSetPhrase(phrase: string, entry: PhraseEntry): boolean {
  return entry.partsOfSpeech.includes('expression') || graphemeCount(phrase) >= setPhraseLength
}

export function phraseNote(phrase: string, entry: PhraseEntry): string | null {
  if (!isSetPhrase(phrase, entry)) return null
  return entry.meanings.slice(0, meaningsPerNote).join('; ')
}
