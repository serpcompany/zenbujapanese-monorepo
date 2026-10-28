import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { type Failure, failure, fields } from '../shared/messages'

export type CaptionsState =
  | { state: 'loading'; videoId: string }
  | { state: 'lines'; videoId: string; lines: Caption[] }
  | { state: 'no-japanese-captions'; videoId: string }
  | { state: 'rate-limited'; videoId: string; retryAt: number }
  | { state: 'failed'; videoId: string; reason: string }

export type NoVideo = { state: 'no-video' }

export type CaptionsRequest =
  | { type: 'video-opened'; videoId: string }
  | { type: 'captions'; tabId: number }
  | { type: 'try-again'; tabId: number }

export type CaptionsAnswer = CaptionsState | NoVideo | Failure

export type CaptionsEnvelope = { target: 'service-worker'; captions: CaptionsRequest }

export type CaptionsChange = { target: 'captions'; tabId: number; captions: CaptionsState }

type Sender = { sendMessage(message: CaptionsEnvelope): Promise<CaptionsAnswer> }

function isCaptionsRequest(value: unknown): value is CaptionsRequest {
  const request = fields(value)
  if (request?.type === 'video-opened') return typeof request.videoId === 'string'
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

export function askCaptions(
  request: CaptionsRequest,
  sender: Sender = chrome.runtime
): Promise<CaptionsAnswer> {
  return Promise.resolve()
    .then(() => sender.sendMessage({ target: 'service-worker', captions: request }))
    .catch((error: unknown) => failure(error))
}
