import {
  askCaptions,
  type CaptionsAnswer,
  type CaptionsEnvelope,
  type CaptionsState,
  isCaptionsChange
} from '../captions/messages'
import type { CaptionedVideo } from '../player-captions/line-controls'
import type { ShowCaptions, ShownCaptions } from '../player-captions/player-captions'
import { isZenbuOn, type Settings } from '../shared/settings'
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

type PageSettings = {
  ask(): Promise<Settings>
  onChanged(listener: (settings: Settings) => void): () => void
}

export type PlayerCaptions = { settings: PageSettings; show: ShowCaptions }

type Options = {
  runtime?: PageRuntime
  follow?: typeof youTubeFollower
  captions?: PlayerCaptions
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
  let settings: Settings | null = null
  let lines: CaptionedVideo | null = null
  let shown: ShownCaptions | null = null

  const clearRetry = () => {
    clearTimeout(retry)
    retry = undefined
  }

  const settle = (answer: CaptionsAnswer) => {
    if (!('videoId' in answer) || answer.videoId !== videoId) return
    clearRetry()
    keepLines(answer)
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

  const hideCaptions = () => {
    if (!shown) return
    shown.stop()
    shown = null
    follower?.showSiteCaptions(true)
  }

  const stopFollowing = () => {
    hideCaptions()
    follower?.stop()
    follower = null
  }

  const captionsWanted = (): CaptionedVideo | null => {
    if (!options.captions || !settings?.['videos.zenbuCaptions']) return null
    if (!isZenbuOn(page.location.hostname, settings)) return null
    return lines?.videoId === videoId && lines.lines.length > 0 ? lines : null
  }

  function sync() {
    const wanted = captionsWanted()
    if (wanted && settings && !shown && options.captions) {
      const following = followed()
      if (!following) return
      following.showSiteCaptions(false)
      shown = options.captions.show(following, wanted, settings)
    } else if (!wanted && shown) {
      hideCaptions()
      if (!videoTabs.open) stopFollowing()
    }
  }

  function keepLines(state: CaptionsState) {
    if (state.state === 'lines' && Array.isArray(state.lines)) {
      if (lines?.videoId !== state.videoId) lines = { videoId: state.videoId, lines: state.lines }
    } else lines = null
    sync()
  }

  const heardSettings = (next: Settings) => {
    settings = next
    shown?.settingsChanged(next)
    sync()
  }

  const askSettings = () => {
    if (!options.captions || settings) return
    options.captions.settings.ask().then(
      read => {
        if (!settings) heardSettings(read)
      },
      () => undefined
    )
  }

  const navigated = () => {
    const next = watchedVideoId(page.location.href)
    if (next === videoId) return
    clearRetry()
    stopFollowing()
    videoId = next
    lines = null
    askSettings()
    open()
    followForVideoTabs()
    if (videoTabs.open) videoTabs.send(followed()?.playback ?? null)
  }

  const onMessage: Listener = message => {
    if (isCaptionsChange(message)) settle(message.captions)
    else if (isVideoControlMessage(message)) {
      const { control } = message
      const following = followed()
      if (shown && control.type === 'seek') shown.seek(control.time)
      else if (following) applyControl(following, control)
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
      if (videoTabs.open) return
      followForVideoTabs()
      if (!shown) stopFollowing()
    })
  }

  const stopSettings = options.captions?.settings.onChanged(heardSettings) ?? unfollowed
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
    stopSettings()
    clearRetry()
    unsubscribe()
    videoTabs.close()
    stopFollowing()
    videoId = null
  }
}
