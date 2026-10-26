import { and, asc, eq, sql } from 'drizzle-orm'
import type { WatchedVideo } from '../domain/store'
import type { Drizzle } from './database'
import { inCodePointOrder, keptRows } from './kept-rows'
import { watchedVideos } from './schema'

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
  const recents = keptRows(db, userId, {
    table: watchedVideos,
    userId: watchedVideos.userId,
    id: watchedVideos.videoId,
    live: eq(watchedVideos.status, 'watched'),
    updatedAt: watchedVideos.updatedAt,
    version: watchedVideos.version,
    entity: 'watchedVideo'
  })
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
    watchedVideoCount: recents.liveCount,
    async oldestWatchedVideo() {
      const [video] = await db
        .select(watchedVideoColumns)
        .from(watchedVideos)
        .where(recents.live)
        .orderBy(asc(watchedVideos.watchedAt), asc(inCodePointOrder(watchedVideos.videoId)))
        .limit(1)
      return video ?? null
    },
    async forgetWatchedVideos(kept: number) {
      await recents.forgetGone(kept)
    }
  }
}
