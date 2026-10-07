import type { Scope } from './clients'
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

interface WatchedVideoData {
  videoId: string
  title: string | null
  author: string | null
  duration: number | null
  position: number | null
  comprehension: number | null
  watchedAt: Date
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
  | Put<'watchedVideo', WatchedVideoData>
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
  reads: Scope
  operations: Record<string, { needs: readonly Scope[]; apply: Operation }>
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

const isoMoment = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/

export function momentOf(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !isoMoment.test(raw)) return null
  const moment = new Date(raw)
  if (Number.isNaN(moment.getTime())) return null
  const now = new Date()
  return moment > now ? now : moment
}

export const plainText = (raw: string) =>
  raw
    .replace(/\p{Cs}/gu, '\uFFFD')
    .replace(/\p{Cc}/gu, ' ')
    .normalize('NFC')
    .trim()

const isItemId = (id: string) => languageReferenceId.test(id) || kanjiItem.test(id)

export function itemIdOf(raw: string | undefined): string | null {
  const id = raw?.startsWith('kanji:') ? `kanji:${raw.slice(6).normalize('NFC')}` : (raw ?? '')
  return isItemId(id) ? id : null
}

export const listWordSeparator = '/'

export const listWordEntityId = (listId: string, itemId: string) =>
  `${listId}${listWordSeparator}${itemId}`

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
