import type { Scope } from './clients'
import type { Cursors } from './cursor'
import { type Change, itemIdOf, listWordSeparator, savedItemIdOf } from './entities'
import type { AboutItem, AccountStore, EntityType } from './store'
import { changesIn, floorFor, readingFrom, syncedEntities, syncLimits } from './sync'

export interface KindRequest {
  cursor?: string
  limit?: number
  item?: string
}

export type KindAnswer =
  | { status: 'read'; changes: Change[]; cursor: string; hasMore: boolean }
  | { status: 'not_readable'; scope: Scope }
  | { status: 'not_about_items' }
  | { status: 'bad_item' }
  | { status: 'invalid_cursor' }
  | { status: 'no_account' }

const endingIn = (item: string): AboutItem | null => {
  const id = itemIdOf(item)
  return id ? { by: 'idEnd', suffix: `${listWordSeparator}${id}` } : null
}

const aboutItems: Partial<Record<EntityType, (item: string) => AboutItem | null>> = {
  knownWord: item => {
    const id = itemIdOf(item)
    return id ? { by: 'id', entityId: id } : null
  },
  listWord: endingIn,
  photoWord: endingIn,
  wordNote: item => {
    const id = savedItemIdOf(item)
    return id ? { by: 'noteItem', itemId: id } : null
  }
}

export const kindsAboutItems = Object.keys(aboutItems) as EntityType[]

export function kindReader(store: AccountStore, cursors: Cursors) {
  return async function readKind(
    userId: string,
    entityType: EntityType,
    request: KindRequest,
    granted: ReadonlySet<Scope>
  ): Promise<KindAnswer> {
    const { reads } = syncedEntities[entityType]
    if (!granted.has(reads)) return { status: 'not_readable', scope: reads }
    const aboutItem = aboutItems[entityType]
    if (request.item !== undefined && !aboutItem) return { status: 'not_about_items' }
    const about = request.item === undefined ? undefined : aboutItem?.(request.item)
    if (about === null) return { status: 'bad_item' }
    if (!(await store.profile(userId))) return { status: 'no_account' }
    const from = await readingFrom(store, cursors, userId, request.cursor, entityType)
    if (from === null) return { status: 'invalid_cursor' }
    const after = from?.sequence ?? 0
    const floor = await floorFor(store, userId, from)
    const limit = request.limit ?? syncLimits.changes.standard
    const entries = await store.kindChangesAfter(userId, {
      entityType,
      after,
      limit: limit + 1,
      about
    })
    const page = entries.slice(0, limit)
    const changes = await changesIn(store.reader(userId), page, granted)
    if (!changes) return { status: 'no_account' }
    const sequence = page.at(-1)?.sequence ?? after
    return {
      status: 'read',
      changes,
      cursor: cursors.encode(userId, { sequence, floor }, entityType),
      hasMore: entries.length > limit
    }
  }
}
