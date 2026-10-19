import { and, eq, lt, ne, notExists, type SQL, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { photoLimits } from '../domain/photo-files'
import { deletePhoto, emptyPhoto } from '../domain/photos'
import { accountStore } from './accounts'
import type { Drizzle } from './database'
import {
  photoFiles,
  photos,
  photoWords,
  profilePhotos,
  rateLimits,
  sessions,
  verifications
} from './schema'

const day = 24 * 60 * 60 * 1000
const atOnce = 500
const roundsAnHour = 20

const olderThan = (column: PgColumn, hours: number) =>
  lt(column, sql`now() - make_interval(hours => ${hours})`)

async function inBatches(
  find: (limit: number) => Promise<{ userId: string; id: string }[]>,
  each: (found: { userId: string; id: string }) => Promise<void>
) {
  for (let round = 0; round < roundsAnHour; round++) {
    const found = await find(atOnce)
    for (const one of found) await each(one)
    if (found.length < atOnce) return
  }
}

const namedBy = (db: Drizzle, file: typeof photoFiles) => [
  notExists(
    db
      .select({ id: photos.id })
      .from(photos)
      .where(
        and(eq(photos.userId, file.userId), eq(photos.id, file.id), ne(photos.status, 'deleted'))
      )
  ),
  notExists(
    db
      .select({ id: profilePhotos.photoId })
      .from(profilePhotos)
      .where(and(eq(profilePhotos.userId, file.userId), eq(profilePhotos.photoId, file.id)))
  )
]

const photosWhere = (db: Drizzle, condition: SQL | undefined) => (limit: number) =>
  db.select({ userId: photos.userId, id: photos.id }).from(photos).where(condition).limit(limit)

async function tidyPhotos(db: Drizzle) {
  const store = accountStore(db)
  await inBatches(
    limit =>
      db
        .select({ userId: photoFiles.userId, id: photoFiles.id })
        .from(photoFiles)
        .where(
          and(
            olderThan(photoFiles.uploadedAt, photoLimits.uploadHeldHours),
            ...namedBy(db, photoFiles)
          )
        )
        .limit(limit),
    file =>
      store.withLockedAccount(file.userId, account => account.releasePhotoFile(file.id)).then()
  )
  await inBatches(
    photosWhere(
      db,
      and(
        eq(photos.status, 'shown'),
        olderThan(photos.updatedAt, photoLimits.uploadHeldHours),
        notExists(
          db
            .select({ id: photoWords.itemId })
            .from(photoWords)
            .where(
              and(
                eq(photoWords.userId, photos.userId),
                eq(photoWords.photoId, photos.id),
                eq(photoWords.present, true)
              )
            )
        )
      )
    ),
    photo =>
      store
        .withLockedAccount(photo.userId, async account => {
          const current = await account.photo(photo.id)
          if (current?.status === 'shown' && (await account.photoWordCount(photo.id)) === 0) {
            await emptyPhoto(account, current)
          }
        })
        .then()
  )
  await inBatches(
    photosWhere(
      db,
      and(
        eq(photos.status, 'emptied'),
        olderThan(photos.updatedAt, photoLimits.emptiedKeptDays * 24)
      )
    ),
    photo =>
      store
        .withLockedAccount(photo.userId, async account => {
          const current = await account.photo(photo.id)
          if (current?.status === 'emptied') await deletePhoto(account, current)
        })
        .then()
  )
}

export async function purgeExpired(db: Drizzle): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`))
  await db.delete(verifications).where(lt(verifications.expiresAt, sql`now()`))
  await db.delete(rateLimits).where(lt(rateLimits.lastRequest, Date.now() - day))
  await tidyPhotos(db)
}
