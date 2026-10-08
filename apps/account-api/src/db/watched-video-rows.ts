import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { EntityType, WatchedVideo } from '../domain/store'
import type { Drizzle } from './database'
import { syncChanges, watchedVideos } from './schema'

const watchedVideoColumns = {
  videoId: watchedVideos.videoId,
  title: watchedVideos.title,
  author: watchedVideos.author,
  duration: watchedVideos.duration,
  position: watchedVideos.position,
  comprehension: watchedVideos.comprehension,
  watchedAt: watchedVideos.watchedAt,
  status: watchedVideos.status,
  version: watchedVideos.version,
  updatedAt: watchedVideos.updatedAt
}

const watchedVideoEntity: EntityType = 'watchedVideo'

export function watchedVideoReader(db: Drizzle, userId: string) {
  return {
    async watchedVideo(videoId: string): Promise<WatchedVideo | null> {
      const [video] = await db
        .select(watchedVideoColumns)
        .from(watchedVideos)
        .where(and(eq(watchedVideos.userId, userId), eq(watchedVideos.videoId, videoId)))
      return video ?? null
    }
  }
}

export function watchedVideoWriter(db: Drizzle, userId: string) {
  const ofTheAccount = eq(watchedVideos.userId, userId)
  const watching = and(ofTheAccount, eq(watchedVideos.status, 'watched'))
  return {
    async saveWatchedVideo(video: Omit<WatchedVideo, 'updatedAt'>) {
      await db
        .insert(watchedVideos)
        .values({ userId, ...video })
        .onConflictDoUpdate({
          target: [watchedVideos.userId, watchedVideos.videoId],
          set: { ...video, updatedAt: sql`now()` }
        })
    },
    async watchedVideoCount() {
      const [row] = await db.select({ videos: count() }).from(watchedVideos).where(watching)
      return row?.videos ?? 0
    },
    async oldestWatchedVideo() {
      const [video] = await db
        .select(watchedVideoColumns)
        .from(watchedVideos)
        .where(watching)
        .orderBy(asc(watchedVideos.watchedAt), asc(watchedVideos.videoId))
        .limit(1)
      return video ?? null
    },
    async forgetWatchedVideos(kept: number) {
      const forgotten = await db
        .select({ videoId: watchedVideos.videoId })
        .from(watchedVideos)
        .where(and(ofTheAccount, ne(watchedVideos.status, 'watched')))
        .orderBy(desc(watchedVideos.updatedAt), desc(watchedVideos.videoId))
        .offset(kept)
      const videoIds = forgotten.map(row => row.videoId)
      if (videoIds.length === 0) return
      await db
        .delete(syncChanges)
        .where(
          and(
            eq(syncChanges.userId, userId),
            eq(syncChanges.entityType, watchedVideoEntity),
            inArray(syncChanges.entityId, videoIds)
          )
        )
      await db
        .delete(watchedVideos)
        .where(and(ofTheAccount, inArray(watchedVideos.videoId, videoIds)))
    }
  }
}
