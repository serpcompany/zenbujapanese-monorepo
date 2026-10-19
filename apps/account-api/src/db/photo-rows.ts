import { and, count, eq, ne, notExists, sql } from 'drizzle-orm'
import { listWordSeparator } from '../domain/entities'
import type { Photo, PhotoFile, PhotoWord, ProfilePhoto } from '../domain/kept-store'
import type { Drizzle } from './database'
import { keptRows } from './kept-rows'
import { photoFileDeletions, photoFiles, photos, photoWords, profilePhotos } from './schema'

const photoColumns = {
  id: photos.id,
  name: photos.name,
  savedAt: photos.savedAt,
  status: photos.status,
  version: photos.version,
  updatedAt: photos.updatedAt
}

const photoWordColumns = {
  photoId: photoWords.photoId,
  itemId: photoWords.itemId,
  headword: photoWords.headword,
  reading: photoWords.reading,
  savedAt: photoWords.savedAt,
  present: photoWords.present,
  version: photoWords.version,
  updatedAt: photoWords.updatedAt
}

const fileColumns = {
  id: photoFiles.id,
  contentType: photoFiles.contentType,
  byteSize: photoFiles.byteSize,
  storageKey: photoFiles.storageKey,
  uploadedAt: photoFiles.uploadedAt
}

const dueIn = (hours: number) => sql`now() + make_interval(hours => ${hours})`

export function photoReader(db: Drizzle, userId: string) {
  return {
    async photo(id: string): Promise<Photo | null> {
      const [photo] = await db
        .select(photoColumns)
        .from(photos)
        .where(and(eq(photos.userId, userId), eq(photos.id, id)))
      return photo ?? null
    },
    async photoWord(photoId: string, itemId: string): Promise<PhotoWord | null> {
      const [word] = await db
        .select(photoWordColumns)
        .from(photoWords)
        .where(
          and(
            eq(photoWords.userId, userId),
            eq(photoWords.photoId, photoId),
            eq(photoWords.itemId, itemId)
          )
        )
      return word ?? null
    },
    async profilePhoto(): Promise<ProfilePhoto | null> {
      const [photo] = await db
        .select({
          photoId: profilePhotos.photoId,
          version: profilePhotos.version,
          updatedAt: profilePhotos.updatedAt
        })
        .from(profilePhotos)
        .where(eq(profilePhotos.userId, userId))
      return photo ?? null
    },
    async photoFile(id: string): Promise<PhotoFile | null> {
      const [file] = await db
        .select(fileColumns)
        .from(photoFiles)
        .where(and(eq(photoFiles.userId, userId), eq(photoFiles.id, id)))
      return file ?? null
    }
  }
}

export function photoWriter(db: Drizzle, userId: string) {
  const photoRows = keptRows(db, userId, {
    table: photos,
    userId: photos.userId,
    id: photos.id,
    live: ne(photos.status, 'deleted'),
    updatedAt: photos.updatedAt,
    entity: 'photo'
  })
  const wordRows = keptRows(db, userId, {
    table: photoWords,
    userId: photoWords.userId,
    id: sql<string>`${photoWords.photoId} || ${listWordSeparator} || ${photoWords.itemId}`,
    live: eq(photoWords.present, true),
    updatedAt: photoWords.updatedAt,
    entity: 'photoWord'
  })
  return {
    async savePhoto(photo: Omit<Photo, 'updatedAt'>) {
      await db
        .insert(photos)
        .values({ userId, ...photo })
        .onConflictDoUpdate({
          target: [photos.userId, photos.id],
          set: { ...photo, updatedAt: sql`now()` }
        })
    },
    async photoWordCount(photoId: string) {
      const [row] = await db
        .select({ words: count() })
        .from(photoWords)
        .where(
          and(
            eq(photoWords.userId, userId),
            eq(photoWords.photoId, photoId),
            eq(photoWords.present, true)
          )
        )
      return row?.words ?? 0
    },
    async savePhotoWord(word: Omit<PhotoWord, 'updatedAt'>) {
      await db
        .insert(photoWords)
        .values({ userId, ...word })
        .onConflictDoUpdate({
          target: [photoWords.userId, photoWords.photoId, photoWords.itemId],
          set: { ...word, updatedAt: sql`now()` }
        })
    },
    async photoWordsOn(photoId: string): Promise<PhotoWord[]> {
      return db
        .select(photoWordColumns)
        .from(photoWords)
        .where(
          and(
            eq(photoWords.userId, userId),
            eq(photoWords.photoId, photoId),
            eq(photoWords.present, true)
          )
        )
    },
    forgetGonePhotoWords: wordRows.forgetGone,
    forgetGonePhotos: photoRows.forgetGone,
    async saveProfilePhoto(photo: Omit<ProfilePhoto, 'updatedAt'>) {
      await db
        .insert(profilePhotos)
        .values({ userId, ...photo })
        .onConflictDoUpdate({
          target: profilePhotos.userId,
          set: { ...photo, updatedAt: sql`now()` }
        })
    },
    async filesOutsideTheLibrary() {
      const [row] = await db
        .select({ files: count() })
        .from(photoFiles)
        .where(
          and(
            eq(photoFiles.userId, userId),
            notExists(
              db
                .select({ id: photos.id })
                .from(photos)
                .where(
                  and(
                    eq(photos.userId, userId),
                    eq(photos.id, photoFiles.id),
                    ne(photos.status, 'deleted')
                  )
                )
            )
          )
        )
      return row?.files ?? 0
    },
    async photoFileCount() {
      const [row] = await db
        .select({ files: count() })
        .from(photoFiles)
        .where(eq(photoFiles.userId, userId))
      return row?.files ?? 0
    },
    async savePhotoFile(file: Omit<PhotoFile, 'uploadedAt'>) {
      const [saved] = await db
        .insert(photoFiles)
        .values({ userId, ...file })
        .returning(fileColumns)
      if (!saved) throw new Error('the photo file was not saved')
      return saved
    },
    async releasePhotoFile(id: string) {
      const [shown] = await db
        .select({ id: photos.id })
        .from(photos)
        .where(and(eq(photos.userId, userId), eq(photos.id, id), ne(photos.status, 'deleted')))
      const [onProfile] = await db
        .select({ id: profilePhotos.photoId })
        .from(profilePhotos)
        .where(and(eq(profilePhotos.userId, userId), eq(profilePhotos.photoId, id)))
      if (shown || onProfile) return
      const [released] = await db
        .delete(photoFiles)
        .where(and(eq(photoFiles.userId, userId), eq(photoFiles.id, id)))
        .returning({ storageKey: photoFiles.storageKey })
      if (released) await deletionDueAt(db, released.storageKey, 0)
    },
    holdPhotoDeletion: (storageKey: string, hours: number) => deletionDueAt(db, storageKey, hours),
    async cancelPhotoDeletion(storageKey: string) {
      await db.delete(photoFileDeletions).where(eq(photoFileDeletions.storageKey, storageKey))
    }
  }
}

export async function deletionDueAt(db: Drizzle, storageKey: string, hours: number) {
  await db
    .insert(photoFileDeletions)
    .values({ storageKey, dueAt: dueIn(hours) })
    .onConflictDoUpdate({ target: photoFileDeletions.storageKey, set: { dueAt: dueIn(hours) } })
}
