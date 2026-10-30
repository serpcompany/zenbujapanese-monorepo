import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { type Failure, failure, fields } from '../shared/messages'
import { isVideoSite, type VideoSite } from '../video/watch-page'

export type CaptionsState =
  | { state: 'loading'; videoId: string }
  | { state: 'lines'; videoId: string; lines: Caption[] }
  | { state: 'no-japanese-captions'; videoId: string }
  | { state: 'rate-limited'; videoId: string; retryAt: number }
  | { state: 'failed'; videoId: string; reason: string }

export type NoVideo = { state: 'no-video' }

export type CaptionsRequest =
  | { type: 'video-opened'; site: VideoSite; videoId: string }
  | { type: 'captions'; tabId: number }
  | { type: 'try-again'; tabId: number }

export type CaptionsAnswer = CaptionsState | NoVideo | Failure

export type CaptionsEnvelope = { target: 'service-worker'; captions: CaptionsRequest }

export type CaptionsChange = { target: 'captions'; tabId: number; captions: CaptionsState }

export type CaptionTracks =
  | { state: 'tracks'; japanese: string; english: string | null }
  | { state: 'no-japanese-captions' }
  | { state: 'no-player' }

export type CaptionTracksRequest = { target: 'captions-tracks'; videoId: string }

type Sender = { sendMessage(message: CaptionsEnvelope): Promise<CaptionsAnswer> }

type TabSender = {
  sendMessage(
    tabId: number,
    message: CaptionTracksRequest,
    options: { frameId: number }
  ): Promise<unknown>
}

export const noPlayer: CaptionTracks = { state: 'no-player' }

function isCaptionsRequest(value: unknown): value is CaptionsRequest {
  const request = fields(value)
  if (request?.type === 'video-opened')
    return typeof request.videoId === 'string' && isVideoSite(request.site)
  if (request?.type === 'captions' || request?.type === 'try-again')
    return Number.isInteger(request.tabId)
  return false
}

export function isCaptionsEnvelope(message: unknown): message is CaptionsEnvelope {
  const envelope = fields(message)
  return envelope?.target === 'service-worker' && isCaptionsRequest(envelope.captions)
}

export function isCaptionsChange(message: unknown): message is CaptionsChange {
  const change = fields(message)
  const captions = fields(change?.captions)
  return (
    change?.target === 'captions' &&
    Number.isInteger(change.tabId) &&
    typeof captions?.state === 'string' &&
    typeof captions.videoId === 'string'
  )
}

export function isCaptionTracksRequest(message: unknown): message is CaptionTracksRequest {
  const request = fields(message)
  return request?.target === 'captions-tracks' && typeof request.videoId === 'string'
}

export function isCaptionTracks(value: unknown): value is CaptionTracks {
  const tracks = fields(value)
  if (tracks?.state !== 'tracks')
    return tracks?.state === 'no-japanese-captions' || tracks?.state === 'no-player'
  return (
    typeof tracks.japanese === 'string' &&
    (tracks.english === null || typeof tracks.english === 'string')
  )
}

export function askCaptions(
  request: CaptionsRequest,
  sender: Sender = chrome.runtime
): Promise<CaptionsAnswer> {
  return Promise.resolve()
    .then(() => sender.sendMessage({ target: 'service-worker', captions: request }))
    .catch((error: unknown) => failure(error))
}

const tabTries = 20

const tabStep = 500

const afterTabStep = () => new Promise<void>(resolve => setTimeout(resolve, tabStep))

export function askTabTracks(
  tabId: number,
  videoId: string,
  tabs: TabSender = chrome.tabs,
  wait: () => Promise<void> = afterTabStep
): Promise<CaptionTracks> {
  const ask = (left: number): Promise<CaptionTracks> =>
    Promise.resolve()
      .then(() => tabs.sendMessage(tabId, { target: 'captions-tracks', videoId }, { frameId: 0 }))
      .catch(() => undefined)
      .then(answer => {
        if (answer !== undefined) return isCaptionTracks(answer) ? answer : noPlayer
        return left > 1 ? wait().then(() => ask(left - 1)) : noPlayer
      })
  return ask(tabTries)
}
