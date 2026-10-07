import { type Profile, type Rejection, rejection } from './profile'
import type { EntityReader, EntityType, LockedAccount } from './store'

export interface ClientMutation {
  id: string
  entity: string
  operation: string
  entityId?: string
  baseVersion?: number
  fields?: Record<string, unknown>
}

interface KnownWordData {
  itemId: string
  headword: string
  reading: string
  known: boolean
}

interface WordListData {
  id: string
  name: string
  position: number
  createdAt: Date
}

interface ListWordData {
  listId: string
  itemId: string
  headword: string
  reading: string
  addedAt: Date
}

interface Put<E extends EntityType, D> {
  entity: E
  entityId: string
  operation: 'put'
  version: number
  data: D
}

export type Change =
  | Put<'profile', Profile>
  | Put<'knownWord', KnownWordData>
  | Put<'list', WordListData>
  | Put<'listWord', ListWordData>
  | {
      entity: Exclude<EntityType, 'profile'>
      entityId: string
      operation: 'delete'
      version: number
      data: null
    }

export type Outcome =
  | { status: 'applied'; version: number }
  | { status: 'conflict'; current: Change }
  | { status: 'rejected'; rejection: Rejection }

type Operation = (account: LockedAccount, mutation: ClientMutation) => Promise<Outcome>

export interface Entity {
  operations: Record<string, Operation>
  current(reader: EntityReader, entityId: string): Promise<Change | null>
}

export const applied = (version: number): Outcome => ({ status: 'applied', version })
export const conflict = (current: Change): Outcome => ({ status: 'conflict', current })
export const rejected = (reason: Rejection): Outcome => ({ status: 'rejected', rejection: reason })

export const gone = (entity: Change['entity'] & EntityType, entityId: string, version: number) =>
  ({ entity, entityId, operation: 'delete', version, data: null }) as Change

export const needsBaseVersion = rejection(
  'invalid_mutation',
  'Send baseVersion: the version of the entity the change was made to, or 0 for one never seen.'
)

const languageReferenceId = /^[0-9a-f]{32}$/
const kanjiItem = /^kanji:\p{Script=Han}$/u
const controlCharacters = /\p{Cc}|\p{Cf}|\p{Cs}/u

export const isItemId = (id: string) => languageReferenceId.test(id) || kanjiItem.test(id)

export const badItem = rejection(
  'invalid_mutation',
  'An item is a Language Reference ID (32 lowercase hex digits) or `kanji:` and one kanji.'
)

export function itemText(
  fields: Record<string, unknown>
): { headword: string; reading: string } | Rejection {
  const text = (value: unknown, least: number) => {
    if (typeof value !== 'string') return null
    const normalized = value.normalize('NFC').trim()
    const length = [...normalized].length
    return length >= least && length <= 200 && !controlCharacters.test(normalized)
      ? normalized
      : null
  }
  const headword = text(fields.headword, 1)
  const reading = text(fields.reading ?? '', 0)
  if (headword === null || reading === null) {
    return rejection(
      'invalid_fields',
      'headword is 1 to 200 characters and reading at most 200, with no control characters.'
    )
  }
  return { headword, reading }
}
