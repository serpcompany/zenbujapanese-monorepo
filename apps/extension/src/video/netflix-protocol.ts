import { type CaptionTracks, isCaptionTracks } from '../captions/messages'
import { fields } from '../shared/messages'
import { isVideoControl, type VideoControl } from './controls'

export const playerRequestEvent = 'zenbu-netflix-player-request'

export const playerAnswerEvent = 'zenbu-netflix-player-answer'

export type PlayerRequest = { id: number; videoId: string } & (
  | { ask: 'tracks' }
  | { control: VideoControl }
)

export type PlayerAnswer = { id: number; tracks: CaptionTracks }

function detail(event: Event): Partial<Record<string, unknown>> | undefined {
  const sent: unknown = 'detail' in event ? event.detail : undefined
  if (typeof sent !== 'string') return undefined
  try {
    return fields(JSON.parse(sent))
  } catch {
    return undefined
  }
}

export function readRequest(event: Event): PlayerRequest | null {
  const request = detail(event)
  const { id, videoId, control } = request ?? {}
  if (typeof id !== 'number' || !Number.isInteger(id) || typeof videoId !== 'string') return null
  if (request?.ask === 'tracks') return { id, videoId, ask: 'tracks' }
  return isVideoControl(control) ? { id, videoId, control } : null
}

export function readAnswer(event: Event): PlayerAnswer | null {
  const { id, tracks } = detail(event) ?? {}
  return typeof id === 'number' && isCaptionTracks(tracks) ? { id, tracks } : null
}

export const playerEvent = (type: string, sent: PlayerRequest | PlayerAnswer) =>
  new CustomEvent(type, { detail: JSON.stringify(sent) })
