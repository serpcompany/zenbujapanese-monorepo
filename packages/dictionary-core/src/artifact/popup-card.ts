import { type PopupCard, popupCard } from '../cards/popup-card'
import { defaultFrequencyPacks } from '../detail/frequency'
import { evidenceLookups } from '../results/learner'
import type { ArtifactDatabase, SqlValue } from './database'
import { type FrequencyList, readFrequency } from './frequency'
import type { KanjiData } from './kanji-data'
import { entriesById, readWord } from './words'

const noFrequency = () => new Map()

export function bundledFrequencyLists(
  db: ArtifactDatabase,
  packIds: readonly string[]
): FrequencyList[] {
  return packIds.flatMap(id => {
    const dictionary = defaultFrequencyPacks.find(pack => pack.id === id)
    if (!dictionary) return []
    return [
      {
        dictionary,
        schema: dictionary.pack,
        rows: (sql: string, params: readonly SqlValue[]) =>
          db.all<Record<string, unknown>>(sql, params)
      }
    ]
  })
}

export function readPopupCard(
  db: ArtifactDatabase,
  kanji: KanjiData,
  languageReferenceID: string,
  lists: readonly FrequencyList[]
): PopupCard | null {
  const id = languageReferenceID.toLowerCase()
  const identity = entriesById(db, [id]).get(id)
  const word = identity ? readWord(db, kanji, identity.entSeq, noFrequency) : null
  if (!word) return null
  const lookups = evidenceLookups(readFrequency(lists, [word.entry.id]))(word.entry.id) ?? []
  return popupCard(word, lookups)
}
