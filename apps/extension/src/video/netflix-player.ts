import { type CaptionTracks, noPlayer } from '../captions/messages'
import type { VideoControl } from './controls'
import {
  type PlayerRequest,
  playerAnswerEvent,
  playerEvent,
  playerRequestEvent,
  readRequest
} from './netflix-protocol'

export type NetflixTrack = {
  trackId?: unknown
  bcp47?: unknown
  rawTrackType?: unknown
  isImageBased?: unknown
  isForcedNarrative?: unknown
  isNoneTrack?: unknown
}

type SessionPlayer = {
  getMovieId?(): unknown
  seek(milliseconds: number): void
  play(): void
  pause(): void
  setPlaybackRate?(rate: number): void
  getTimedTextTrackList(): NetflixTrack[]
  getTimedTextTrack(): NetflixTrack | null | undefined
  setTimedTextTrack(track: NetflixTrack): unknown
}

type PlayerApp = {
  getAPI(): {
    videoPlayer: {
      getAllPlayerSessionIds(): string[]
      getVideoPlayerBySessionId(id: string): SessionPlayer | undefined
    }
  }
  getState(): {
    videoPlayer?: { cadmiumPlayerRepository?: { playersById?: Record<string, unknown> } }
  }
}

export type NetflixWindow = Window & {
  netflix?: { appContext?: { state?: { playerApp?: PlayerApp } } }
}

type Session = { id: string; player: SessionPlayer; app: PlayerApp }

export type PlayerTiming = { step: number; player: number; track: number }

const defaultTiming: PlayerTiming = { step: 100, player: 10_000, track: 5_000 }

const walkLimit = 100_000

function safely<T>(read: () => T | null): T | null {
  try {
    return read()
  } catch {
    return null
  }
}

function sessionOf(view: NetflixWindow, videoId: string): Session | null {
  const app = view.netflix?.appContext?.state?.playerApp
  if (!app) return null
  const api = app.getAPI().videoPlayer
  const sessions = api.getAllPlayerSessionIds().flatMap(id => {
    const player = api.getVideoPlayerBySessionId(id)
    return player ? [{ id, player, app }] : []
  })
  const told = sessions.filter(session => typeof session.player.getMovieId === 'function')
  if (told.length > 0)
    return told.find(session => String(session.player.getMovieId?.()) === videoId) ?? null
  const watched = sessions.filter(session => session.id.startsWith('watch'))
  return watched.length === 1 ? (watched[0] ?? null) : null
}

const isLanguage = (track: NetflixTrack, language: string) =>
  typeof track.bcp47 === 'string' &&
  (track.bcp47 === language || track.bcp47.startsWith(`${language}-`))

const usable = (track: NetflixTrack) =>
  track.isNoneTrack !== true && track.isForcedNarrative !== true && track.isImageBased !== true

const subtitlesFirst = (track: NetflixTrack) => (track.rawTrackType === 'SUBTITLES' ? 0 : 1)

export function chosenTrack(
  tracks: readonly NetflixTrack[],
  language: string
): NetflixTrack | null {
  const fitting = tracks.filter(track => usable(track) && isLanguage(track, language))
  return fitting.sort((one, other) => subtitlesFirst(one) - subtitlesFirst(other))[0] ?? null
}

const skipped = (value: object) =>
  ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Node

function trackURL(session: Session, track: NetflixTrack): string | null {
  const queue: unknown[] = [
    session.app.getState().videoPlayer?.cadmiumPlayerRepository?.playersById?.[session.id]
  ]
  const seen = new Set<object>()
  for (let index = 0; index < queue.length && index < walkLimit; index++) {
    const value = queue[index]
    if (typeof value !== 'object' || value === null || seen.has(value) || skipped(value)) continue
    seen.add(value)
    const found = value as { type?: unknown; trackId?: unknown; urls?: unknown }
    const url = Array.isArray(found.urls) ? (found.urls[0] as { url?: unknown })?.url : undefined
    if (found.type === 'timedtext' && found.trackId === track.trackId && typeof url === 'string')
      return url
    for (const key of Object.keys(value)) queue.push(safely(() => Reflect.get(value, key)))
  }
  return null
}

function until<T>(read: () => T | null, view: Window, step: number, wait: number) {
  return new Promise<T | null>(resolve => {
    let left = Math.ceil(wait / step)
    const attempt = () => {
      const value = safely(read)
      if (value !== null || left <= 0) return resolve(value)
      left -= 1
      view.setTimeout(attempt, step)
    }
    attempt()
  })
}

async function tracksOf(
  view: NetflixWindow,
  videoId: string,
  timing: PlayerTiming
): Promise<CaptionTracks> {
  const ready = () => {
    const session = sessionOf(view, videoId)
    return session && session.player.getTimedTextTrackList().length > 0 ? session : null
  }
  const session = await until(ready, view, timing.step, timing.player)
  if (!session) return noPlayer
  const listed = session.player.getTimedTextTrackList()
  const japanese = chosenTrack(listed, 'ja')
  if (!japanese) return { state: 'no-japanese-captions' }
  const learners = session.player.getTimedTextTrack() ?? listed.find(track => track.isNoneTrack)
  let switched = false
  const urlOf = async (track: NetflixTrack | null): Promise<string | null> => {
    if (!track) return null
    const loaded = safely(() => trackURL(session, track))
    if (loaded) return loaded
    switched = true
    await session.player.setTimedTextTrack(track)
    return until(() => trackURL(session, track), view, timing.step, timing.track)
  }
  try {
    const japaneseURL = await urlOf(japanese)
    if (!japaneseURL) return noPlayer
    return {
      state: 'tracks',
      japanese: japaneseURL,
      english: await urlOf(chosenTrack(listed, 'en'))
    }
  } finally {
    if (switched && learners) session.player.setTimedTextTrack(learners)
  }
}

function applyControl(view: NetflixWindow, videoId: string, control: VideoControl) {
  const player = sessionOf(view, videoId)?.player
  if (!player) return
  if (control.type === 'seek') player.seek(Math.round(control.time * 1000))
  else if (control.type === 'play') player.play()
  else if (control.type === 'pause') player.pause()
  else if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(control.rate)
  else {
    const video = view.document.querySelector('video')
    if (video) video.playbackRate = control.rate
  }
}

export function serveNetflixPlayer(
  view: NetflixWindow,
  timing: PlayerTiming = defaultTiming
): () => void {
  const page = view.document
  let asking: Promise<unknown> = Promise.resolve()
  const answer = (request: PlayerRequest & { ask: 'tracks' }) => {
    asking = asking
      .then(() => tracksOf(view, request.videoId, timing))
      .catch(() => noPlayer)
      .then(tracks =>
        page.dispatchEvent(playerEvent(playerAnswerEvent, { id: request.id, tracks }))
      )
  }
  const onRequest = (event: Event) => {
    const request = readRequest(event)
    if (!request) return
    if ('ask' in request) answer(request)
    else safely(() => applyControl(view, request.videoId, request.control))
  }
  page.addEventListener(playerRequestEvent, onRequest)
  return () => page.removeEventListener(playerRequestEvent, onRequest)
}
