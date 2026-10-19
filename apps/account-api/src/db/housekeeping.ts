import { and, eq, lt, notExists, sql } from 'drizzle-orm'
import { photoLimits } from '../domain/photo-files'
import type { Drizzle } from './database'
import { photoWriter } from './photo-rows'
import {
  photoFiles,
  photos,
  profilePhotos,
  rateLimits,
  sessions,
  users,
  verifications
} from './schema'

const day = 24 * 60 * 60 * 1000
const filesReleasedAtOnce = 500

async function releaseUnnamedPhotoFiles(db: Drizzle) {
  const unnamed = await db
    .select({ userId: photoFiles.userId, id: photoFiles.id })
    .from(photoFiles)
    .where(
      and(
        lt(
          photoFiles.uploadedAt,
          sql`now() - make_interval(hours => ${photoLimits.uploadHeldHours})`
        ),
        notExists(
          db
            .select({ id: photos.id })
            .from(photos)
            .where(
              and(
                eq(photos.userId, photoFiles.userId),
                eq(photos.id, photoFiles.id),
                eq(photos.present, true)
              )
            )
        ),
        notExists(
          db
            .select({ id: profilePhotos.photoId })
            .from(profilePhotos)
            .where(
              and(
                eq(profilePhotos.userId, photoFiles.userId),
                eq(profilePhotos.photoId, photoFiles.id)
              )
            )
        )
      )
    )
    .limit(filesReleasedAtOnce)
  for (const file of unnamed) {
    await db.transaction(async tx => {
      const [locked] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, file.userId))
        .for('update')
      if (locked) await photoWriter(tx, file.userId).releasePhotoFile(file.id)
    })
  }
}

export async function purgeExpired(db: Drizzle): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`))
  await db.delete(verifications).where(lt(verifications.expiresAt, sql`now()`))
  await db.delete(rateLimits).where(lt(rateLimits.lastRequest, Date.now() - day))
  await releaseUnnamedPhotoFiles(db)
}
