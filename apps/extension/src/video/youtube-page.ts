import {
  askCaptions,
  type CaptionsAnswer,
  type CaptionsEnvelope,
  isCaptionsChange
} from '../captions/messages'
import { applyControl, isVideoControlMessage } from './controls'
import type { VideoFollower } from './follower'
import { watchedVideoId } from './watch-page'
import { youTubeFollower } from './youtube-follower'

const retryMargin = 1_000

type Listener = (message: unknown) => false

type PageRuntime = {
  sendMessage(message: CaptionsEnvelope): Promise<CaptionsAnswer>
  onMessage: { addListener(listener: Listener): void; removeListener(listener: Listener): void }
}

type Options = {
  runtime?: PageRuntime
  follow?: typeof youTubeFollower
}

export function followYouTubePage(page: Document, options: Options = {}): () => void {
  const runtime = options.runtime ?? chrome.runtime
  const follow = options.follow ?? youTubeFollower
  let videoId: string | null = null
  let follower: VideoFollower | null = null
  let retry: ReturnType<typeof setTimeout> | undefined

  const clearRetry = () => {
    clearTimeout(retry)
    retry = undefined
  }

  const settle = (answer: CaptionsAnswer) => {
    if (!('videoId' in answer) || answer.videoId !== videoId) return
    clearRetry()
    if (answer.state !== 'rate-limited') return
    retry = setTimeout(open, Math.max(0, answer.retryAt - Date.now()) + retryMargin)
  }

  function open() {
    if (videoId === null) return
    askCaptions({ type: 'video-opened', videoId }, runtime).then(settle)
  }

  const navigated = () => {
    const next = watchedVideoId(page.location.href)
    if (next === videoId) return
    clearRetry()
    follower?.stop()
    follower = null
    videoId = next
    open()
  }

  const onMessage: Listener = message => {
    if (isCaptionsChange(message)) settle(message.captions)
    else if (videoId !== null && isVideoControlMessage(message)) {
      follower ??= follow(page, videoId)
      applyControl(follower, message.control)
    }
    return false
  }

  runtime.onMessage.addListener(onMessage)
  page.addEventListener('yt-navigate-finish', navigated)
  page.defaultView?.addEventListener('popstate', navigated)
  navigated()

  return () => {
    page.removeEventListener('yt-navigate-finish', navigated)
    page.defaultView?.removeEventListener('popstate', navigated)
    runtime.onMessage.removeListener(onMessage)
    clearRetry()
    follower?.stop()
    follower = null
    videoId = null
  }
}
