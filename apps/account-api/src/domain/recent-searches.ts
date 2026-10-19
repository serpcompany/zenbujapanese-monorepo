import { createHash } from 'node:crypto'
import {
  applied,
  type Change,
  type ClientMutation,
  conflict,
  type Entity,
  gone,
  journaled,
  momentOf,
  needsBaseVersion,
  type Outcome,
  rejected,
  sha256IdOf
} from './entities'
import type { RecentSearch } from './kept-store'
import { rejection } from './profile'
import { keepTheNewest, recentLimits } from './recents'
import type { LockedAccount } from './store'

export const searchLimits = { ...recentLimits, queryLength: 1_000 } as const

const badSearch = rejection(
  'invalid_mutation',
  "A recent search's entityId is the SHA-256 of its query in UTF-8, after Unicode NFC, in 64 lowercase hex digits."
)
const badFields = rejection(
  'invalid_fields',
  `A search has its query (1 to ${searchLimits.queryLength.toLocaleString('en-US')} characters, with no control characters) and searchedAt, an ISO 8601 time from 2000 on. Nothing else.`
)

export const searchIdOf = (query: string) =>
  createHash('sha256').update(query.normalize('NFC')).digest('hex')

const asChange = (search: RecentSearch): Change =>
  search.status === 'searched' && search.query !== null && search.searchedAt !== null
    ? {
        entity: 'recentSearch',
        entityId: search.id,
        operation: 'put',
        version: search.version,
        data: { id: search.id, query: search.query, searchedAt: search.searchedAt }
      }
    : gone('recentSearch', search.id, search.version)

function queryOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const query = raw.normalize('NFC')
  const length = [...query].length
  const fits = length > 0 && length <= searchLimits.queryLength
  return fits && !/\p{Cc}|\p{Cs}/u.test(query) ? query : null
}

const emptied = (id: string) => ({ id, query: null, searchedAt: null })

async function save(account: LockedAccount, search: Omit<RecentSearch, 'updatedAt'>, op: string) {
  await account.saveRecentSearch(search)
  return journaled(account, 'recentSearch', search.id, search.version, op)
}

const keepTheNewestOf = (account: LockedAccount) =>
  keepTheNewest({
    count: () => account.recentSearchCount(),
    oldest: () => account.oldestRecentSearch(),
    prune: async oldest => {
      const pruned = { ...emptied(oldest.id), status: 'pruned' as const }
      await save(account, { ...pruned, version: oldest.version + 1 }, 'prune')
    },
    forget: kept => account.forgetRecentSearches(kept)
  })

async function search(account: LockedAccount, mutation: ClientMutation): Promise<Outcome> {
  const id = sha256IdOf(mutation.entityId)
  if (!id) return rejected(badSearch)
  if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
  const fields = mutation.fields ?? {}
  const query = queryOf(fields.query)
  const searchedAt = momentOf(fields.searchedAt)
  const onlyThose = Object.keys(fields).every(key => key === 'query' || key === 'searchedAt')
  if (!query || !searchedAt || !onlyThose) return rejected(badFields)
  if (searchIdOf(query) !== id) return rejected(badSearch)
  const current = await account.recentSearch(id)
  if (current?.status === 'removed' && mutation.baseVersion !== current.version) {
    return conflict(asChange(current))
  }
  const searching = current?.status === 'searched' ? current : null
  const latest =
    searching?.searchedAt && searching.searchedAt > searchedAt ? searching.searchedAt : searchedAt
  if (searching && searching.searchedAt?.getTime() === latest.getTime()) {
    return applied(searching.version)
  }
  const version = (current?.version ?? 0) + 1
  const outcome = await save(
    account,
    { id, query, searchedAt: latest, status: 'searched', version },
    'search'
  )
  if (!searching) await keepTheNewestOf(account)
  return outcome
}

const writes = ['searches:write'] as const

export const recentSearches: Entity = {
  reads: 'searches:read',
  operations: {
    search: { needs: writes, apply: search },
    remove: {
      needs: writes,
      apply: async (account, mutation) => {
        const id = sha256IdOf(mutation.entityId)
        if (!id) return rejected(badSearch)
        const current = await account.recentSearch(id)
        if (!current || current.status === 'removed') return applied(current?.version ?? 0)
        const version = current.version + 1
        const outcome = await save(
          account,
          { ...emptied(id), status: 'removed', version },
          'remove'
        )
        await account.forgetRecentSearches(recentLimits.goneKept)
        return outcome
      }
    }
  },
  async current(reader, entityId) {
    const found = await reader.recentSearch(entityId)
    return found ? asChange(found) : gone('recentSearch', entityId, 0)
  }
}
