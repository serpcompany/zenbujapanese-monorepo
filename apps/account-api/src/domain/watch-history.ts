import {
  applied,
  type Change,
  type ClientMutation,
  conflict,
  type Entity,
  gone,
  momentOf,
  needsBaseVersion,
  type Outcome,
  plainText,
  rejected
} from './entities'
import { isRejection, type Rejection, rejection } from './profile'
import type { LockedAccount, WatchedVideo } from './store'

export const watchLimits = {
  videos: 50,
  goneKept: 100,
  textLength: 200,
  seconds: 10_000_000
} as const

type Details = Pick<WatchedVideo, 'title' | 'author' | 'duration' | 'position' | 'comprehension'>

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/
const badVideo = rejection(
  'invalid_mutation',
  "A watched video's entityId is its YouTube video ID: 11 letters, digits, `-`, or `_`."
)
const badFields = rejection(
  'invalid_fields',
  `A watch has watchedAt, an ISO 8601 time from 2000 on, and may have title and author (strings, cut to ${watchLimits.textLength} characters), duration and position (seconds from 0 to ${watchLimits.seconds}), and comprehension (from 0 to 1). Nothing else.`
)

const textFields = ['title', 'author'] as const
const numberFields = [
  ['duration', watchLimits.seconds],
  ['position', watchLimits.seconds],
  ['comprehension', 1]
] as const
const allowed = new Set<string>(['watchedAt', ...textFields, ...numberFields.map(([key]) => key)])

const videoIdOf = (raw: string | undefined) => (raw && videoIdPattern.test(raw) ? raw : null)

const asChange = (video: WatchedVideo): Change =>
  video.status === 'watched'
    ? {
        entity: 'watchedVideo',
        entityId: video.videoId,
        operation: 'put',
        version: video.version,
        data: {
          videoId: video.videoId,
          title: video.title,
          author: video.author,
          duration: video.duration,
          position: video.position,
          comprehension: video.comprehension,
          watchedAt: video.watchedAt ?? video.updatedAt
        }
      }
    : gone('watchedVideo', video.videoId, video.version)

const detailsOf = (video: WatchedVideo | null): Details => ({
  title: video?.title ?? null,
  author: video?.author ?? null,
  duration: video?.duration ?? null,
  position: video?.position ?? null,
  comprehension: video?.comprehension ?? null
})

const emptied = (videoId: string) => ({ videoId, ...detailsOf(null), watchedAt: null })

function shortText(raw: unknown): string | null | Rejection {
  if (typeof raw !== 'string') return badFields
  const text = [...plainText(raw)].slice(0, watchLimits.textLength).join('').trim()
  return text === '' ? null : text
}

function watchFields(
  fields: Record<string, unknown>
): { details: Partial<Details>; watchedAt: Date } | Rejection {
  if (Object.keys(fields).some(key => !allowed.has(key))) return badFields
  const watchedAt = momentOf(fields.watchedAt)
  if (!watchedAt) return badFields
  const details: Partial<Details> = {}
  for (const key of textFields) {
    if (!(key in fields)) continue
    const text = shortText(fields[key])
    if (isRejection(text)) return text
    if (text !== null) details[key] = text
  }
  for (const [key, most] of numberFields) {
    if (!(key in fields)) continue
    const value = fields[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > most) {
      return badFields
    }
    details[key] = value
  }
  return { details, watchedAt }
}

function merged(
  watching: WatchedVideo | null,
  sent: { details: Partial<Details>; watchedAt: Date }
) {
  const kept = detailsOf(watching)
  if (!watching?.watchedAt || sent.watchedAt >= watching.watchedAt) {
    return { ...kept, ...sent.details, watchedAt: sent.watchedAt }
  }
  const missing = Object.entries(sent.details).filter(
    ([key]) => kept[key as keyof Details] === null
  )
  return { ...kept, ...Object.fromEntries(missing), watchedAt: watching.watchedAt }
}

const unchanged = (current: WatchedVideo, next: Omit<WatchedVideo, 'version' | 'updatedAt'>) =>
  (Object.keys(next) as (keyof typeof next)[]).every(key =>
    key === 'watchedAt'
      ? current.watchedAt?.getTime() === next.watchedAt?.getTime()
      : current[key] === next[key]
  )

async function save(
  account: LockedAccount,
  video: Omit<WatchedVideo, 'updatedAt'>,
  operation: string
) {
  await account.saveWatchedVideo(video)
  await account.journal({
    entityType: 'watchedVideo',
    entityId: video.videoId,
    entityVersion: video.version,
    operation
  })
}

async function keepTheNewest(account: LockedAccount) {
  while ((await account.watchedVideoCount()) > watchLimits.videos) {
    const oldest = await account.oldestWatchedVideo()
    if (!oldest) break
    const pruned = { ...emptied(oldest.videoId), status: 'pruned' as const }
    await save(account, { ...pruned, version: oldest.version + 1 }, 'prune')
  }
  await account.forgetWatchedVideos(watchLimits.goneKept)
}

async function watch(account: LockedAccount, mutation: ClientMutation): Promise<Outcome> {
  const videoId = videoIdOf(mutation.entityId)
  if (!videoId) return rejected(badVideo)
  if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
  const sent = watchFields(mutation.fields ?? {})
  if (isRejection(sent)) return rejected(sent)
  const current = await account.watchedVideo(videoId)
  if (current?.status === 'removed' && mutation.baseVersion !== current.version) {
    return conflict(asChange(current))
  }
  const watching = current?.status === 'watched' ? current : null
  const next = { videoId, ...merged(watching, sent), status: 'watched' as const }
  if (watching && unchanged(watching, next)) return applied(watching.version)
  const version = (current?.version ?? 0) + 1
  await save(account, { ...next, version }, 'watch')
  if (!watching) await keepTheNewest(account)
  return applied(version)
}

const writes = ['watch:write'] as const

export const watchHistory: Entity = {
  reads: 'watch:read',
  operations: {
    watch: { needs: writes, apply: watch },
    remove: {
      needs: writes,
      apply: async (account, mutation) => {
        const videoId = videoIdOf(mutation.entityId)
        if (!videoId) return rejected(badVideo)
        const current = await account.watchedVideo(videoId)
        if (!current || current.status === 'removed') return applied(current?.version ?? 0)
        const version = current.version + 1
        await save(account, { ...emptied(videoId), status: 'removed', version }, 'remove')
        await account.forgetWatchedVideos(watchLimits.goneKept)
        return applied(version)
      }
    }
  },
  async current(reader, entityId) {
    const videoId = videoIdOf(entityId) ?? entityId
    const video = await reader.watchedVideo(videoId)
    return video ? asChange(video) : gone('watchedVideo', videoId, 0)
  }
}
