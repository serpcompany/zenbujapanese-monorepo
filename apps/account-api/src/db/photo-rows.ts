import { and, count, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm'
import { listWordSeparator } from '../domain/entities'
import type { NewPhotoFile, Photo, PhotoFile, PhotoWord, ProfilePhoto } from '../domain/kept-store'
import type { Drizzle } from './database'
import { keptRows } from './kept-rows'
import {
  forgottenVersions,
  photoFileDeletions,
  photoFiles,
  photos,
  photoWords,
  profilePhotos
} from './schema'

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
  uploadedAt: photoFiles.uploadedAt,
  profileUploadAt: photoFiles.profileUploadAt
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

function photoFileWriter(db: Drizzle, userId: string) {
  const ofFile = (id: string) => and(eq(photoFiles.userId, userId), eq(photoFiles.id, id))
  return {
    async photoFileCount() {
      const [row] = await db
        .select({ files: count() })
        .from(photoFiles)
        .where(eq(photoFiles.userId, userId))
      return row?.files ?? 0
    },
    async profileUploadCount() {
      const [row] = await db
        .select({ files: count() })
        .from(photoFiles)
        .where(and(eq(photoFiles.userId, userId), isNotNull(photoFiles.profileUploadAt)))
      return row?.files ?? 0
    },
    async markProfileUpload(id: string) {
      await db.update(photoFiles).set({ profileUploadAt: sql`now()` }).where(ofFile(id))
    },
    async savePhotoFile(file: NewPhotoFile, profileUpload: boolean) {
      const [saved] = await db
        .insert(photoFiles)
        .values({ userId, ...file, profileUploadAt: profileUpload ? sql`now()` : null })
        .returning(fileColumns)
      if (!saved) throw new Error('the photo file was not saved')
      return saved
    },
    async movePhotoFile(id: string, storageKey: string) {
      const [moved] = await db
        .update(photoFiles)
        .set({ storageKey })
        .where(ofFile(id))
        .returning(fileColumns)
      if (!moved) throw new Error('the photo file was not there to move')
      return moved
    },
    async releasePhotoFile(id: string) {
      const [onProfile] = await db
        .select({ id: profilePhotos.photoId })
        .from(profilePhotos)
        .where(and(eq(profilePhotos.userId, userId), eq(profilePhotos.photoId, id)))
      if (onProfile) return
      const [shown] = await db
        .select({ id: photos.id })
        .from(photos)
        .where(and(eq(photos.userId, userId), eq(photos.id, id), ne(photos.status, 'deleted')))
      if (shown) {
        await db.update(photoFiles).set({ profileUploadAt: null }).where(ofFile(id))
        return
      }
      const [released] = await db
        .delete(photoFiles)
        .where(ofFile(id))
        .returning({ storageKey: photoFiles.storageKey })
      if (released) await deletionDueAt(db, released.storageKey, 0)
    },
    async cancelPhotoDeletion(storageKey: string) {
      await db.delete(photoFileDeletions).where(eq(photoFileDeletions.storageKey, storageKey))
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
    version: photos.version,
    entity: 'photo',
    remembered: true
  })
  const wordRows = keptRows(db, userId, {
    table: photoWords,
    userId: photoWords.userId,
    id: sql<string>`${photoWords.photoId} || ${listWordSeparator} || ${photoWords.itemId}`,
    live: eq(photoWords.present, true),
    updatedAt: photoWords.updatedAt,
    version: photoWords.version,
    entity: 'photoWord',
    remembered: true
  })
  return {
    ...photoFileWriter(db, userId),
    async savePhoto(photo: Omit<Photo, 'updatedAt'>) {
      await db
        .insert(photos)
        .values({ userId, ...photo })
        .onConflictDoUpdate({
          target: [photos.userId, photos.id],
          set: { ...photo, updatedAt: sql`now()` }
        })
    },
    async forgetGonePhotos(kept: number) {
      const forgotten = await photoRows.forgetGone(kept)
      if (forgotten.length > 0) await wordRows.forgetAll(inArray(photoWords.photoId, forgotten))
    },
    async forgottenVersion(entityType: 'photo' | 'photoWord') {
      const [row] = await db
        .select({ version: forgottenVersions.version })
        .from(forgottenVersions)
        .where(
          and(eq(forgottenVersions.userId, userId), eq(forgottenVersions.entityType, entityType))
        )
      return row?.version ?? 0
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
    async forgetRemovedPhotoWords(photoId: string, kept: number) {
      await wordRows.forgetGone(kept, eq(photoWords.photoId, photoId))
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
    async saveProfilePhoto(photo: Omit<ProfilePhoto, 'updatedAt'>) {
      await db
        .insert(profilePhotos)
        .values({ userId, ...photo })
        .onConflictDoUpdate({
          target: profilePhotos.userId,
          set: { ...photo, updatedAt: sql`now()` }
        })
    }
  }
}

export async function deletionDueAt(db: Drizzle, storageKey: string, hours: number) {
  await db
    .insert(photoFileDeletions)
    .values({ storageKey, dueAt: dueIn(hours) })
    .onConflictDoUpdate({ target: photoFileDeletions.storageKey, set: { dueAt: dueIn(hours) } })
}
