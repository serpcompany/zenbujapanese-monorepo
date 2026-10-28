import {
  askCaptions,
  type CaptionsAnswer,
  type CaptionsEnvelope,
  isCaptionsChange
} from '../captions/messages'
import { applyControl, isVideoControlMessage } from './controls'
import type { VideoFollower } from './follower'
import { type TabPort, videoTabPort, videoTabPorts } from './video-tab-port'
import { watchedVideoId } from './watch-page'
import { youTubeFollower } from './youtube-follower'

const retryMargin = 1_000

type Listener = (message: unknown) => false

type Connected = (port: TabPort) => void

type PageRuntime = {
  sendMessage(message: CaptionsEnvelope): Promise<CaptionsAnswer>
  onMessage: { addListener(listener: Listener): void; removeListener(listener: Listener): void }
  onConnect: { addListener(listener: Connected): void; removeListener(listener: Connected): void }
}

type Options = {
  runtime?: PageRuntime
  follow?: typeof youTubeFollower
}

const unfollowed = () => undefined

export function followYouTubePage(page: Document, options: Options = {}): () => void {
  const runtime = options.runtime ?? chrome.runtime
  const follow = options.follow ?? youTubeFollower
  const videoTabs = videoTabPorts()
  let videoId: string | null = null
  let follower: VideoFollower | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let unsubscribe: () => void = unfollowed

  const clearRetry = () => {
    clearTimeout(retry)
    retry = undefined
  }

  const settle = (answer: CaptionsAnswer) => {
    if (!('videoId' in answer) || answer.videoId !== videoId) return
    clearRetry()
    if (answer.state !== 'rate-limited' || answer.retryAt <= Date.now()) return
    retry = setTimeout(open, answer.retryAt - Date.now() + retryMargin)
  }

  function open() {
    if (videoId === null) return
    askCaptions({ type: 'video-opened', videoId }, runtime).then(settle)
  }

  const followed = (): VideoFollower | null => {
    if (videoId === null) return null
    follower ??= follow(page, videoId)
    return follower
  }

  const followForVideoTabs = () => {
    unsubscribe()
    unsubscribe = unfollowed
    if (!videoTabs.open) return
    const following = followed()
    if (following) unsubscribe = following.subscribe(videoTabs.send)
  }

  const navigated = () => {
    const next = watchedVideoId(page.location.href)
    if (next === videoId) return
    clearRetry()
    follower?.stop()
    follower = null
    videoId = next
    open()
    followForVideoTabs()
    if (videoTabs.open) videoTabs.send(followed()?.playback ?? null)
  }

  const onMessage: Listener = message => {
    if (isCaptionsChange(message)) settle(message.captions)
    else if (isVideoControlMessage(message)) {
      const following = followed()
      if (following) applyControl(following, message.control)
    }
    return false
  }

  const onConnect: Connected = port => {
    if (port.name !== videoTabPort) return
    const first = !videoTabs.open
    videoTabs.add(port, followed()?.playback ?? null)
    if (first) followForVideoTabs()
    port.onDisconnect.addListener(() => {
      videoTabs.remove(port)
      if (!videoTabs.open) followForVideoTabs()
    })
  }

  runtime.onMessage.addListener(onMessage)
  runtime.onConnect.addListener(onConnect)
  page.addEventListener('yt-navigate-finish', navigated)
  page.defaultView?.addEventListener('popstate', navigated)
  navigated()

  return () => {
    page.removeEventListener('yt-navigate-finish', navigated)
    page.defaultView?.removeEventListener('popstate', navigated)
    runtime.onMessage.removeListener(onMessage)
    runtime.onConnect.removeListener(onConnect)
    clearRetry()
    unsubscribe()
    videoTabs.close()
    follower?.stop()
    follower = null
    videoId = null
  }
}
