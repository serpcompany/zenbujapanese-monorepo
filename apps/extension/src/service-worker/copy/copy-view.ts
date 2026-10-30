import {
  type CopiedList,
  type CopiedNote,
  type CopiedWord,
  type CopyChange,
  favoritesList,
  type WordState,
  type WordView
} from '../../shared/account-copy'
import { favoritesName, stateOf } from './copy-changes'
import { type Draft, type Item, keyOf } from './kept'

const text = (value: unknown) => (typeof value === 'string' ? value : '')

const textOrNull = (value: unknown) => (typeof value === 'string' ? value : null)

const shown = (items: Item[], entity: Item['entity']) =>
  items.filter(item => item.entity === entity && item.data !== null)

const wordOf = (data: Record<string, unknown>): CopiedWord => ({
  item: text(data.itemId),
  headword: text(data.headword),
  reading: text(data.reading)
})

const newestFirst = (first: Item, second: Item) =>
  text(second.data?.stateChangedAt).localeCompare(text(first.data?.stateChangedAt))

export const wordsIn = (items: Item[], state: WordState): CopiedWord[] =>
  shown(items, 'knownWord')
    .filter(item => stateOf(item.data) === state)
    .sort(newestFirst)
    .map(item => wordOf(item.data ?? {}))

const emptyFavorites: CopiedList = {
  id: favoritesList,
  name: favoritesName,
  position: 0,
  createdAt: '',
  words: []
}

export function listsOf(draft: Draft): CopiedList[] {
  const items = draft.all()
  const words = shown(items, 'listWord')
  const lists = shown(items, 'list')
    .map(({ entityId, data }) => ({
      id: entityId,
      name: text(data?.name),
      position: typeof data?.position === 'number' ? data.position : 0,
      createdAt: text(data?.createdAt),
      words: words
        .filter(word => word.entityId.startsWith(`${entityId}/`))
        .map(word => ({ ...wordOf(word.data ?? {}), addedAt: text(word.data?.addedAt) }))
    }))
    .sort(
      (first, second) =>
        first.position - second.position ||
        first.createdAt.localeCompare(second.createdAt) ||
        first.id.localeCompare(second.id)
    )
  const noFavorites = draft.meta !== null && !draft.get(keyOf('list', favoritesList))
  return noFavorites ? [emptyFavorites, ...lists] : lists
}

export const notesOf = (items: Item[]): CopiedNote[] =>
  shown(items, 'wordNote').map(({ entityId, data }) => ({
    id: entityId,
    item: text(data?.itemId),
    text: text(data?.text),
    headword: textOrNull(data?.headword),
    reading: textOrNull(data?.reading)
  }))

export const wordViewOf = (draft: Draft, item: string): WordView => ({
  state: stateOf(draft.get(keyOf('knownWord', item))?.data),
  lists: listsOf(draft).map(({ id, name, words }) => ({
    id,
    name,
    holds: words.some(word => word.item === item)
  })),
  notes: notesOf(draft.all()).filter(note => note.item === item)
})

const noteOn = (draft: Draft, note: string) => {
  const kept = draft.get(keyOf('wordNote', note))?.data
  return kept ? text(kept.itemId) : null
}

export function aboutOnly(draft: Draft, change: CopyChange, item: string): boolean {
  switch (change.change) {
    case 'mark':
    case 'clear':
    case 'set':
    case 'add-word':
    case 'remove-word':
      return change.item === item
    case 'write-note': {
      const on = noteOn(draft, change.note)
      return change.item === item && (on === null || on === item)
    }
    case 'delete-note':
      return noteOn(draft, change.note) === item
    default:
      return false
  }
}
