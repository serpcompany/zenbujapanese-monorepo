import { and, eq, sql } from 'drizzle-orm'
import type { Setting, WordNote } from '../domain/kept-store'
import type { Drizzle } from './database'
import { keptRows } from './kept-rows'
import { learnerSettings, wordNotes } from './schema'

const noteColumns = {
  id: wordNotes.id,
  itemId: wordNotes.itemId,
  text: wordNotes.text,
  headword: wordNotes.headword,
  reading: wordNotes.reading,
  present: wordNotes.present,
  version: wordNotes.version,
  updatedAt: wordNotes.updatedAt
}

const settingColumns = {
  name: learnerSettings.name,
  value: learnerSettings.value,
  version: learnerSettings.version,
  updatedAt: learnerSettings.updatedAt
}

export function noteReader(db: Drizzle, userId: string) {
  return {
    async wordNote(id: string): Promise<WordNote | null> {
      const [note] = await db
        .select(noteColumns)
        .from(wordNotes)
        .where(and(eq(wordNotes.userId, userId), eq(wordNotes.id, id)))
      return note ?? null
    },
    async setting(name: string): Promise<Setting | null> {
      const [setting] = await db
        .select(settingColumns)
        .from(learnerSettings)
        .where(and(eq(learnerSettings.userId, userId), eq(learnerSettings.name, name)))
      return setting ?? null
    }
  }
}

export function noteWriter(db: Drizzle, userId: string) {
  const notes = keptRows(db, userId, {
    table: wordNotes,
    userId: wordNotes.userId,
    id: wordNotes.id,
    live: eq(wordNotes.present, true),
    updatedAt: wordNotes.updatedAt,
    version: wordNotes.version,
    entity: 'wordNote'
  })
  return {
    async forgetGoneNotes(kept: number) {
      await notes.forgetGone(kept)
    },
    async saveWordNote(note: Omit<WordNote, 'updatedAt'>) {
      await db
        .insert(wordNotes)
        .values({ userId, ...note })
        .onConflictDoUpdate({
          target: [wordNotes.userId, wordNotes.id],
          set: { ...note, updatedAt: sql`now()` }
        })
    },
    wordNoteCount: notes.liveCount,
    async saveSetting(setting: Omit<Setting, 'updatedAt'>) {
      await db
        .insert(learnerSettings)
        .values({ userId, ...setting })
        .onConflictDoUpdate({
          target: [learnerSettings.userId, learnerSettings.name],
          set: { ...setting, updatedAt: sql`now()` }
        })
    }
  }
}
