import { and, count, eq, sql } from 'drizzle-orm'
import type { Bookmark } from '../domain/store'
import type { Drizzle } from './database'
import { translationBookmarks } from './schema'

const bookmarkColumns = {
  id: translationBookmarks.id,
  text: translationBookmarks.text,
  translation: translationBookmarks.translation,
  language: translationBookmarks.language,
  bookmarkedAt: translationBookmarks.bookmarkedAt,
  present: translationBookmarks.present,
  version: translationBookmarks.version,
  updatedAt: translationBookmarks.updatedAt
}

export function bookmarkReader(db: Drizzle, userId: string) {
  return {
    async bookmark(id: string): Promise<Bookmark | null> {
      const [bookmark] = await db
        .select(bookmarkColumns)
        .from(translationBookmarks)
        .where(and(eq(translationBookmarks.userId, userId), eq(translationBookmarks.id, id)))
      return bookmark ?? null
    }
  }
}

export function bookmarkWriter(db: Drizzle, userId: string) {
  return {
    async saveBookmark(bookmark: Omit<Bookmark, 'updatedAt'>) {
      await db
        .insert(translationBookmarks)
        .values({ userId, ...bookmark })
        .onConflictDoUpdate({
          target: [translationBookmarks.userId, translationBookmarks.id],
          set: { ...bookmark, updatedAt: sql`now()` }
        })
    },
    async bookmarkCount() {
      const [row] = await db
        .select({ bookmarks: count() })
        .from(translationBookmarks)
        .where(and(eq(translationBookmarks.userId, userId), eq(translationBookmarks.present, true)))
      return row?.bookmarks ?? 0
    }
  }
}
