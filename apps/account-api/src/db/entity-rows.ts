import { and, count, eq, sql } from 'drizzle-orm'
import { listWordSeparator } from '../domain/entities'
import type { EntityReader, KnownWord, ListWord, WordList } from '../domain/store'
import type { Drizzle } from './database'
import { knownWords, listWords, syncChanges, users, wordLists } from './schema'
import { watchedVideoReader, watchedVideoWriter } from './watched-video-rows'

export const profileColumns = {
  id: users.id,
  name: users.name,
  username: users.username,
  email: users.email,
  version: users.version,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt
}

const knownWordColumns = {
  itemId: knownWords.itemId,
  headword: knownWords.headword,
  reading: knownWords.reading,
  known: knownWords.known,
  version: knownWords.version,
  updatedAt: knownWords.updatedAt
}

const wordListColumns = {
  id: wordLists.id,
  name: wordLists.name,
  position: wordLists.position,
  deleted: wordLists.deleted,
  version: wordLists.version,
  createdAt: wordLists.createdAt,
  updatedAt: wordLists.updatedAt
}

const listWordColumns = {
  listId: listWords.listId,
  itemId: listWords.itemId,
  headword: listWords.headword,
  reading: listWords.reading,
  present: listWords.present,
  version: listWords.version,
  addedAt: listWords.addedAt,
  updatedAt: listWords.updatedAt
}

export function readerOn(db: Drizzle, userId: string): EntityReader {
  return {
    ...watchedVideoReader(db, userId),
    async currentProfile() {
      const [profile] = await db.select(profileColumns).from(users).where(eq(users.id, userId))
      return profile ?? null
    },
    async knownWord(itemId) {
      const [word] = await db
        .select(knownWordColumns)
        .from(knownWords)
        .where(and(eq(knownWords.userId, userId), eq(knownWords.itemId, itemId)))
      return word ?? null
    },
    async wordList(listId) {
      const [list] = await db
        .select(wordListColumns)
        .from(wordLists)
        .where(and(eq(wordLists.userId, userId), eq(wordLists.id, listId)))
      return list ?? null
    },
    async listWord(listId, itemId) {
      const [word] = await db
        .select(listWordColumns)
        .from(listWords)
        .where(
          and(
            eq(listWords.userId, userId),
            eq(listWords.listId, listId),
            eq(listWords.itemId, itemId)
          )
        )
      return word ?? null
    }
  }
}

export function writerOn(db: Drizzle, userId: string) {
  return {
    ...watchedVideoWriter(db, userId),
    async saveKnownWord(word: Omit<KnownWord, 'updatedAt'>) {
      await db
        .insert(knownWords)
        .values({ userId, ...word })
        .onConflictDoUpdate({
          target: [knownWords.userId, knownWords.itemId],
          set: { ...word, updatedAt: sql`now()` }
        })
    },
    async wordListCount() {
      const [row] = await db
        .select({ lists: count() })
        .from(wordLists)
        .where(and(eq(wordLists.userId, userId), eq(wordLists.deleted, false)))
      return row?.lists ?? 0
    },
    async saveWordList(list: Omit<WordList, 'createdAt' | 'updatedAt'>) {
      await db
        .insert(wordLists)
        .values({ userId, ...list })
        .onConflictDoUpdate({
          target: [wordLists.userId, wordLists.id],
          set: { ...list, updatedAt: sql`now()` }
        })
    },
    async listWordCount(listId: string) {
      const [row] = await db
        .select({ words: count() })
        .from(listWords)
        .where(
          and(
            eq(listWords.userId, userId),
            eq(listWords.listId, listId),
            eq(listWords.present, true)
          )
        )
      return row?.words ?? 0
    },
    async saveListWord(word: Omit<ListWord, 'addedAt' | 'updatedAt'>) {
      await db
        .insert(listWords)
        .values({ userId, ...word })
        .onConflictDoUpdate({
          target: [listWords.userId, listWords.listId, listWords.itemId],
          set: {
            ...word,
            updatedAt: sql`now()`,
            addedAt: sql`case when ${word.present} and not ${listWords.present} then now() else ${listWords.addedAt} end`
          }
        })
    },
    async dropListWords(listId: string) {
      await db
        .delete(syncChanges)
        .where(
          and(
            eq(syncChanges.userId, userId),
            eq(syncChanges.entityType, 'listWord'),
            sql`${syncChanges.entityId} like ${`${listId}${listWordSeparator}%`}`
          )
        )
      await db
        .delete(listWords)
        .where(and(eq(listWords.userId, userId), eq(listWords.listId, listId)))
    }
  }
}
