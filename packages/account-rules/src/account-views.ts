import type { EntityData, Held } from './account-copy'
import { listLimits } from './lists'

export interface Shown<D extends EntityData = EntityData> {
  entityId: string
  version: number
  data: D
}

const present = (held: readonly Held[]): Shown[] =>
  held.flatMap(each => (each.data === null ? [] : [{ ...each, data: each.data }]))

const textOf = (data: EntityData, field: string) => String(data[field] ?? '')

const ascending = (one: string, other: string) => (one < other ? -1 : one > other ? 1 : 0)

export const newestChangedFirst = (held: readonly Held[]): Shown[] => present(held).reverse()

export const listsInOrder = (lists: readonly Held[]): Shown[] =>
  present(lists).sort(
    (one, other) =>
      Number(one.data.position) - Number(other.data.position) ||
      ascending(textOf(one.data, 'createdAt'), textOf(other.data, 'createdAt')) ||
      ascending(one.entityId, other.entityId)
  )

export function nextListPosition(lists: readonly Held[]): number {
  const positions = present(lists).map(list => Number(list.data.position))
  return Math.min(Math.max(-1, ...positions) + 1, listLimits.position)
}

export function listMoves(
  ordered: readonly Shown[],
  from: number,
  to: number
): { entityId: string; position: number }[] {
  const moved = [...ordered]
  const [list] = moved.splice(from, 1)
  if (!list) return []
  moved.splice(to, 0, list)
  return moved.flatMap((each, position) =>
    Number(each.data.position) === position ? [] : [{ entityId: each.entityId, position }]
  )
}

const newestOn = (words: readonly Held[], ownerId: string, timeField: string): Shown[] =>
  present(words)
    .filter(word => word.entityId.startsWith(`${ownerId}/`))
    .sort((one, other) => ascending(textOf(other.data, timeField), textOf(one.data, timeField)))

export const wordsOfList = (words: readonly Held[], listId: string) =>
  newestOn(words, listId, 'addedAt')

export const wordsOfPhoto = (words: readonly Held[], photoId: string) =>
  newestOn(words, photoId, 'savedAt')

export const recentFirst = (held: readonly Held[], timeField: string): Shown[] =>
  present(held).sort(
    (one, other) =>
      ascending(textOf(other.data, timeField), textOf(one.data, timeField)) ||
      ascending(other.entityId, one.entityId)
  )

export const isMarkedKnown = (data: EntityData | null | undefined) => data?.known === true

const noteIdentity = /^wn1:/

export const isNoteWithoutAWord = (itemId: string) => noteIdentity.test(itemId)

export const chosenPacks = (value: string): string[] => (value === '' ? [] : value.split(','))

export const chosenValue = (packs: readonly string[]) => packs.join(',')
