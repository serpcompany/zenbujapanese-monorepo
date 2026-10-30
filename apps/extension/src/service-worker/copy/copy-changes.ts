import type { Mutation } from '@zenbu/account-rules/account-copy'
import { listLimits, listName } from '@zenbu/account-rules/lists'
import { noteText } from '@zenbu/account-rules/notes'
import { keptWithin, plainText } from '@zenbu/account-rules/text'
import { type CopyChange, favoritesList, type WordState } from '../../shared/account-copy'
import { fields } from '../../shared/messages'
import { type Data, type Draft, type Entity, itemKey, keyOf, type Queued, queuedKey } from './kept'

type Change<Name extends CopyChange['change']> = Extract<CopyChange, { change: Name }>

type Word = { item: string; headword: string; reading: string }

const wordItem = /^[0-9a-f]{32}$/
const kanjiItem = /^kanji:\p{Script=Han}$/u
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function itemOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const item = value.normalize('NFC')
  return wordItem.test(item) || kanjiItem.test(item) ? item : null
}

function uuidOf(value: unknown): string | null {
  const id = typeof value === 'string' ? value.toLowerCase() : null
  return id !== null && uuid.test(id) ? id : null
}

function wordText(value: unknown, least: number): string | null {
  const text = typeof value === 'string' ? plainText(value) : null
  return text !== null && keptWithin(text, least, 200) ? text : null
}

const nameOf = (value: unknown) => (typeof value === 'string' ? listName(value) : null)

const positionOf = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= listLimits.position
    ? value
    : null

const noteWord = (value: unknown): string | null | undefined =>
  value === undefined || value === null ? null : (wordText(value, 0) ?? undefined)

function wordOf(raw: Data): Word | null {
  const item = itemOf(raw.item)
  const headword = wordText(raw.headword, 1)
  const reading = wordText(raw.reading ?? '', 0)
  return item !== null && headword !== null && reading !== null ? { item, headword, reading } : null
}

function listChangeOf(raw: Data): CopyChange | null {
  const list = uuidOf(raw.list)
  if (list === null) return null
  if (raw.change === 'delete-list') return { change: 'delete-list', list }
  const name = raw.name === undefined ? undefined : nameOf(raw.name)
  const position = raw.position === undefined ? undefined : positionOf(raw.position)
  if (raw.change === 'create-list') {
    return name && position !== null && position !== undefined
      ? { change: 'create-list', list, name, position }
      : null
  }
  if (name === null || position === null || (name === undefined && position === undefined)) {
    return null
  }
  return {
    change: 'update-list',
    list,
    ...(name === undefined ? {} : { name }),
    ...(position === undefined ? {} : { position })
  }
}

function setOf(raw: Data): CopyChange | null {
  const item = itemOf(raw.item)
  if (item === null) return null
  if (raw.state === 'unknown') return { change: 'set', item, state: 'unknown' }
  if (raw.state !== 'learning' && raw.state !== 'known') return null
  const word = wordOf(raw)
  return word && { change: 'set', ...word, state: raw.state }
}

function addWordOf(raw: Data, list: string): CopyChange | null {
  const word = wordOf(raw)
  if (word === null) return null
  if (raw.name === undefined) return { change: 'add-word', list, ...word }
  const name = nameOf(raw.name)
  return name === null ? null : { change: 'add-word', list, ...word, name }
}

function listWordOf(raw: Data): CopyChange | null {
  const list = uuidOf(raw.list)
  if (list === null) return null
  if (raw.change === 'add-word') return addWordOf(raw, list)
  const item = itemOf(raw.item)
  return item === null ? null : { change: 'remove-word', list, item }
}

function noteChangeOf(raw: Data): CopyChange | null {
  const note = uuidOf(raw.note)
  if (note === null) return null
  if (raw.change === 'delete-note') return { change: 'delete-note', note }
  const item = itemOf(raw.item)
  const text = typeof raw.text === 'string' ? noteText(raw.text) : null
  const headword = noteWord(raw.headword)
  const reading = noteWord(raw.reading)
  if (item === null || text === null || headword === undefined || reading === undefined) {
    return null
  }
  return { change: 'write-note', note, item, text, headword, reading }
}

export function changeOf(value: unknown): CopyChange | null {
  const raw = fields(value)
  switch (raw?.change) {
    case 'mark': {
      const word = wordOf(raw)
      return word && { change: 'mark', ...word }
    }
    case 'clear': {
      const item = itemOf(raw.item)
      return item === null ? null : { change: 'clear', item }
    }
    case 'set':
      return setOf(raw)
    case 'create-list':
    case 'update-list':
    case 'delete-list':
      return listChangeOf(raw)
    case 'add-word':
    case 'remove-word':
      return listWordOf(raw)
    case 'write-note':
    case 'delete-note':
      return noteChangeOf(raw)
    default:
      return null
  }
}

export type Clock = { newId(): string; now(): string }

type Local = {
  entity: Entity
  entityId: string
  data: Data | null
  operation: string
  fields?: Data
}

const unsentFor = (draft: Draft, key: string) =>
  draft.meta?.queue.findLast(queued => !queued.sent && queuedKey(queued) === key)

function queue(
  draft: Draft,
  local: Local,
  clock: Clock,
  merge?: (earlier: Mutation) => Mutation
): void {
  const meta = draft.meta
  if (!meta) return
  const key = keyOf(local.entity, local.entityId)
  const before = draft.get(key) ?? null
  const version = before?.version ?? 0
  draft.put({ entity: local.entity, entityId: local.entityId, version, data: local.data })
  const mutation: Mutation = {
    id: clock.newId(),
    entity: local.entity,
    operation: local.operation,
    entityId: local.entityId,
    baseVersion: version,
    ...(local.fields ? { fields: local.fields } : {})
  }
  const earlier = unsentFor(draft, key)
  if (earlier) {
    earlier.mutation = merge ? merge(earlier.mutation) : mutation
    delete earlier.refusedWith
  } else meta.queue.push({ mutation, sent: false, before })
}

const shown = (draft: Draft, entity: Entity, entityId: string) =>
  draft.get(keyOf(entity, entityId))?.data ?? null

function mark(draft: Draft, { item, headword, reading }: Change<'mark'>, clock: Clock) {
  const known = shown(draft, 'knownWord', item)?.known === true
  if (known && !unsentFor(draft, keyOf('knownWord', item))) return true
  const stateChangedAt = clock.now()
  const data = { itemId: item, headword, reading, state: 'known', known: true, stateChangedAt }
  const fields = { headword, reading, stateChangedAt }
  queue(draft, { entity: 'knownWord', entityId: item, data, operation: 'mark', fields }, clock)
  return true
}

function clear(draft: Draft, { item }: Change<'clear'>, clock: Clock) {
  const word = shown(draft, 'knownWord', item)
  if (word?.known !== true) return true
  const stateChangedAt = clock.now()
  const data = { ...word, state: 'unknown', known: false, stateChangedAt }
  queue(
    draft,
    { entity: 'knownWord', entityId: item, data, operation: 'clear', fields: { stateChangedAt } },
    clock
  )
  return true
}

export const stateOf = (data: Data | null | undefined): WordState =>
  data?.state === 'learning' || data?.state === 'known' || data?.state === 'unknown'
    ? data.state
    : data?.known === true
      ? 'known'
      : 'unknown'

function set(draft: Draft, change: Change<'set'>, clock: Clock) {
  const word = shown(draft, 'knownWord', change.item)
  if (stateOf(word) === change.state) return true
  const stateChangedAt = clock.now()
  const moved = { state: change.state, known: change.state === 'known', stateChangedAt }
  const local =
    change.state === 'unknown'
      ? { data: { ...word, ...moved }, fields: { state: change.state, stateChangedAt } }
      : {
          data: {
            itemId: change.item,
            headword: change.headword,
            reading: change.reading,
            ...moved
          },
          fields: {
            state: change.state,
            headword: change.headword,
            reading: change.reading,
            stateChangedAt
          }
        }
  queue(draft, { entity: 'knownWord', entityId: change.item, operation: 'set', ...local }, clock)
  return true
}

function createList(draft: Draft, { list, name, position }: Change<'create-list'>, clock: Clock) {
  if (draft.get(keyOf('list', list))) return false
  const data = { id: list, name, position, createdAt: clock.now() }
  const fields = { name, position }
  queue(draft, { entity: 'list', entityId: list, data, operation: 'create', fields }, clock)
  return true
}

function updateList(draft: Draft, change: Change<'update-list'>, clock: Clock) {
  const list = shown(draft, 'list', change.list)
  if (!list) return false
  const moved = {
    ...(change.name === undefined ? {} : { name: change.name }),
    ...(change.position === undefined ? {} : { position: change.position })
  }
  const data = { ...list, ...moved }
  queue(
    draft,
    { entity: 'list', entityId: change.list, data, operation: 'update', fields: moved },
    clock,
    earlier => ({ ...earlier, fields: { ...earlier.fields, ...moved } })
  )
  return true
}

function deleteList(draft: Draft, { list }: Change<'delete-list'>, clock: Clock) {
  const meta = draft.meta
  if (!meta || !shown(draft, 'list', list)) return false
  const words = `listWord:${list}/`
  for (const item of draft.all()) {
    if (itemKey(item).startsWith(words)) draft.remove(itemKey(item))
  }
  const create = unsentFor(draft, keyOf('list', list))
  meta.queue = meta.queue.filter(queued => queued.sent || !queuedKey(queued).startsWith(words))
  if (create?.mutation.operation === 'create') {
    meta.queue = meta.queue.filter(queued => queued !== create)
    draft.remove(keyOf('list', list))
    return true
  }
  queue(draft, { entity: 'list', entityId: list, data: null, operation: 'delete' }, clock)
  return true
}

export const favoritesName = 'Favorites'

const nextPosition = (draft: Draft) =>
  Math.min(
    listLimits.position,
    Math.max(
      0,
      ...draft
        .all()
        .filter(item => item.entity === 'list' && item.data !== null)
        .map(item => (typeof item.data?.position === 'number' ? item.data.position : 0))
    ) + 1
  )

function listFor(draft: Draft, { list, name }: Change<'add-word'>, clock: Clock): boolean {
  const kept = draft.get(keyOf('list', list))
  if (kept) return kept.data !== null
  const made =
    list === favoritesList
      ? { name: favoritesName, position: 0 }
      : name === undefined
        ? null
        : { name, position: nextPosition(draft) }
  return made !== null && createList(draft, { change: 'create-list', list, ...made }, clock)
}

function addWord(draft: Draft, change: Change<'add-word'>, clock: Clock) {
  const { list, item, headword, reading } = change
  if (!listFor(draft, change, clock)) return false
  const data = { listId: list, itemId: item, headword, reading, addedAt: clock.now() }
  queue(
    draft,
    {
      entity: 'listWord',
      entityId: `${list}/${item}`,
      data,
      operation: 'add',
      fields: { headword, reading }
    },
    clock
  )
  return true
}

function removeWord(draft: Draft, { list, item }: Change<'remove-word'>, clock: Clock) {
  const entityId = `${list}/${item}`
  if (!shown(draft, 'listWord', entityId)) return true
  queue(draft, { entity: 'listWord', entityId, data: null, operation: 'remove' }, clock)
  return true
}

function writeNote(draft: Draft, change: Change<'write-note'>, clock: Clock) {
  const { note, item, text, headword, reading } = change
  queue(
    draft,
    {
      entity: 'wordNote',
      entityId: note,
      data: { id: note, itemId: item, text, headword, reading },
      operation: 'write',
      fields: { item, text, headword, reading }
    },
    clock
  )
  return true
}

function deleteNote(draft: Draft, { note }: Change<'delete-note'>, clock: Clock) {
  if (!shown(draft, 'wordNote', note)) return true
  queue(draft, { entity: 'wordNote', entityId: note, data: null, operation: 'delete' }, clock)
  return true
}

export function applyChange(draft: Draft, change: CopyChange, clock: Clock): boolean {
  switch (change.change) {
    case 'mark':
      return mark(draft, change, clock)
    case 'clear':
      return clear(draft, change, clock)
    case 'set':
      return set(draft, change, clock)
    case 'create-list':
      return createList(draft, change, clock)
    case 'update-list':
      return updateList(draft, change, clock)
    case 'delete-list':
      return deleteList(draft, change, clock)
    case 'add-word':
      return addWord(draft, change, clock)
    case 'remove-word':
      return removeWord(draft, change, clock)
    case 'write-note':
      return writeNote(draft, change, clock)
    case 'delete-note':
      return deleteNote(draft, change, clock)
  }
}

export const studyChanges = (queue: readonly Queued[]) =>
  queue.filter(queued => queued.mutation.entity !== 'setting').length
