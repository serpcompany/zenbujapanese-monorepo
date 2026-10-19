import { and, asc, eq, sql } from 'drizzle-orm'
import type { RecentSearch } from '../domain/kept-store'
import type { Drizzle } from './database'
import { keptRows } from './kept-rows'
import { recentSearches } from './schema'

const searchColumns = {
  id: recentSearches.id,
  query: recentSearches.query,
  searchedAt: recentSearches.searchedAt,
  status: recentSearches.status,
  version: recentSearches.version,
  updatedAt: recentSearches.updatedAt
}

export function searchReader(db: Drizzle, userId: string) {
  return {
    async recentSearch(id: string): Promise<RecentSearch | null> {
      const [search] = await db
        .select(searchColumns)
        .from(recentSearches)
        .where(and(eq(recentSearches.userId, userId), eq(recentSearches.id, id)))
      return search ?? null
    }
  }
}

export function searchWriter(db: Drizzle, userId: string) {
  const recents = keptRows(db, userId, {
    table: recentSearches,
    userId: recentSearches.userId,
    id: recentSearches.id,
    live: eq(recentSearches.status, 'searched'),
    updatedAt: recentSearches.updatedAt,
    version: recentSearches.version,
    entity: 'recentSearch'
  })
  return {
    async saveRecentSearch(search: Omit<RecentSearch, 'updatedAt'>) {
      await db
        .insert(recentSearches)
        .values({ userId, ...search })
        .onConflictDoUpdate({
          target: [recentSearches.userId, recentSearches.id],
          set: { ...search, updatedAt: sql`now()` }
        })
    },
    recentSearchCount: recents.liveCount,
    async oldestRecentSearch() {
      const [search] = await db
        .select(searchColumns)
        .from(recentSearches)
        .where(recents.live)
        .orderBy(asc(recentSearches.searchedAt), asc(recentSearches.id))
        .limit(1)
      return search ?? null
    },
    async forgetRecentSearches(kept: number) {
      await recents.forgetGone(kept)
    }
  }
}
