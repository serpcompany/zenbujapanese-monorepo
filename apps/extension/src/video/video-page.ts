import {
  askCaptions,
  type CaptionsAnswer,
  type CaptionsEnvelope,
  type CaptionsState,
  type CaptionTracks,
  isCaptionsChange,
  isCaptionTracksRequest,
  noPlayer
} from '../captions/messages'
import type { CaptionedVideo } from '../player-captions/line-controls'
import type { ShowCaptions, ShownCaptions } from '../player-captions/player-captions'
import { isZenbuOn, type PageSettings, type Settings } from '../shared/settings'
import { applyControl, isVideoControlMessage } from './controls'
import type { VideoFollower } from './follower'
import { type TabPort, videoTabPort, videoTabPorts } from './video-tab-port'
import { type VideoSite, watchedVideo } from './watch-page'

const retryMargin = 1_000

export type PageListener = (
  message: unknown,
  sender?: unknown,
  sendResponse?: (response: CaptionTracks) => void
) => boolean

type Connected = (port: TabPort) => void

type PageRuntime = {
  sendMessage(message: CaptionsEnvelope): Promise<CaptionsAnswer>
  onMessage: {
    addListener(listener: PageListener): void
    removeListener(listener: PageListener): void
  }
  onConnect: { addListener(listener: Connected): void; removeListener(listener: Connected): void }
}

export type PlayerCaptions = { settings: PageSettings; show: ShowCaptions }

export type VideoSitePage = {
  name: VideoSite
  follow(page: Document, videoId: string): VideoFollower
  navigations(page: Document, navigated: () => void): () => void
  captionTracks?(videoId: string): Promise<CaptionTracks>
}

type Options = {
  runtime?: PageRuntime
  captions?: PlayerCaptions
}

const unfollowed = () => undefined

export function followVideoPage(
  page: Document,
  site: VideoSitePage,
  options: Options = {}
): () => void {
  const runtime = options.runtime ?? chrome.runtime
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
    askCaptions({ type: 'video-opened', site: site.name, videoId }, runtime).then(settle)
  }

  const followed = (): VideoFollower | null => {
    if (videoId === null) return null
    follower ??= site.follow(page, videoId)
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
    const watched = watchedVideo(page.location.href)
    const next = watched?.site === site.name ? watched.videoId : null
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

  const answerTracks = (asked: string, sendResponse: (response: CaptionTracks) => void) => {
    const tracks = asked === videoId && site.captionTracks ? site.captionTracks(asked) : null
    if (!tracks) return false
    tracks.catch(() => noPlayer).then(sendResponse)
    return true
  }

  const onMessage: PageListener = (message, _sender, sendResponse) => {
    if (isCaptionTracksRequest(message) && sendResponse)
      return answerTracks(message.videoId, sendResponse)
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
  const stopNavigations = site.navigations(page, navigated)
  page.defaultView?.addEventListener('popstate', navigated)
  navigated()

  return () => {
    stopNavigations()
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
