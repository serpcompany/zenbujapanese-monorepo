import type { ChangeOutcome, Held } from '@zenbu/account-rules/account-copy'
import { listsInOrder, nextListPosition } from '@zenbu/account-rules/account-views'
import { listName } from '@zenbu/account-rules/lists'
import { noteText } from '@zenbu/account-rules/notes'
import { accountPagesOpen, builtAccountService } from './availability'
import type { Failure } from './client'
import { accountPages } from './pages'
import type { SavedItem } from './saved-item'
import { seemsSignedIn } from './signed-in'
import type { KindRead, SyncedCopy } from './synced'

const syncedActions = ['markKnown', 'addToList', 'addNote'] as const

export type SyncedAction = (typeof syncedActions)[number]

export type Attempt = ChangeOutcome<Failure> | { status: 'not-sent' }

interface ListRow {
  id: string
  name: string
  holds: boolean
}

export interface NoteRow {
  id: string
  text: string
  version: number
}

const notSent: Attempt = { status: 'not-sent' }

export const isSyncedAction = (action: string): action is SyncedAction =>
  (syncedActions as readonly string[]).includes(action)

export const syncedService = () => (seemsSignedIn() ? builtAccountService() : null)

export const offersSignIn = () => accountPagesOpen() && !seemsSignedIn()

export function readsFor(action: SyncedAction, item: SavedItem): KindRead[] {
  if (action === 'markKnown') return [{ kind: 'knownWord', item: item.id }]
  if (action === 'addToList') return [{ kind: 'list' }, { kind: 'listWord', item: item.id }]
  return [{ kind: 'wordNote', item: item.id }]
}

const labelsOf = (item: SavedItem) => ({ headword: item.headword, reading: item.reading })

export const isKnown = (copy: SyncedCopy, item: SavedItem) =>
  copy.heldOne('knownWord', item.id)?.data?.known === true

export const markKnown = (copy: SyncedCopy, item: SavedItem, known: boolean) =>
  known
    ? copy.change('knownWord', 'mark', item.id, labelsOf(item))
    : copy.change('knownWord', 'clear', item.id)

const listWordId = (listId: string, item: SavedItem) => `${listId}/${item.id}`

export const listPage = (listId: string) =>
  `${accountPages.lists.path}?list=${encodeURIComponent(listId)}`

export const subscriptionPage = `${accountPages.account.path}#subscription`

export const listRows = (copy: SyncedCopy, item: SavedItem): ListRow[] =>
  listsInOrder(copy.held('list')).map(list => ({
    id: list.entityId,
    name: String(list.data.name ?? ''),
    holds: Boolean(copy.heldOne('listWord', listWordId(list.entityId, item))?.data)
  }))

export const putInList = (copy: SyncedCopy, listId: string, item: SavedItem, holds: boolean) =>
  holds
    ? copy.change('listWord', 'add', listWordId(listId, item), labelsOf(item))
    : copy.change('listWord', 'remove', listWordId(listId, item))

export const holdsList = (copy: SyncedCopy, listId: string) =>
  Boolean(copy.heldOne('list', listId)?.data)

export async function newListHolding(
  copy: SyncedCopy,
  { id, typed }: { id: string; typed: string },
  item: SavedItem
): Promise<Attempt> {
  const name = listName(typed)
  if (name === null) return notSent
  const position = nextListPosition(copy.held('list'))
  const created = await copy.change('list', 'create', id, { name, position })
  const madeBefore = created.status === 'rejected' && created.code === 'already_exists'
  if (created.status !== 'applied' && !madeBefore) return created
  return putInList(copy, id, item, true)
}

export function noteRows(copy: SyncedCopy, shownBefore: readonly string[]): NoteRow[] {
  const place = (id: string) => {
    const at = shownBefore.indexOf(id)
    return at === -1 ? shownBefore.length : at
  }
  return copy
    .held('wordNote')
    .flatMap(note =>
      note.data === null
        ? []
        : [{ id: note.entityId, text: String(note.data.text ?? ''), version: note.version }]
    )
    .sort((one, other) => place(one.id) - place(other.id))
}

export async function writeNote(
  copy: SyncedCopy,
  item: SavedItem,
  noteId: string,
  typed: string,
  began?: Held | null
): Promise<Attempt> {
  const text = noteText(typed)
  if (text === null) return notSent
  const fields = { item: item.id, text, ...labelsOf(item) }
  return copy.change('wordNote', 'write', noteId, fields, began)
}

export const deleteNote = (copy: SyncedCopy, noteId: string, began?: Held | null) =>
  copy.change('wordNote', 'delete', noteId, undefined, began)
