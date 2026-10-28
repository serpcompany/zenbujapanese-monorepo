import type { Playback, VideoFollower } from './follower'

export const siteCaptionsAttribute = 'data-zenbu-site-captions'

const adClass = 'ad-showing'

const siteCaptionsRule = `#movie_player[${siteCaptionsAttribute}="hidden"] .ytp-caption-window-container { display: none !important; }`

const followedEvents = ['play', 'pause', 'playing', 'seeked', 'timeupdate', 'ended', 'emptied']

type Frames = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>

type Listener = (playback: Playback | null) => void

export function youTubeFollower(
  page: Document,
  videoId: string,
  frames: Frames = page.defaultView ?? window
): VideoFollower {
  const listeners = new Set<Listener>()
  let player: HTMLElement | null = null
  let video: HTMLVideoElement | null = null
  let ad = false
  let loading = false
  let learnerRate: number | null = null
  let heldTime = 0
  let siteCaptionsShown = true
  let frame: number | null = null
  let style: HTMLStyleElement | null = null

  const snapshot = (): Playback | null => {
    if (!video) return null
    if (!ad) heldTime = video.currentTime
    const playing = !ad && !video.paused && !video.ended
    return { videoId, time: heldTime, playing, rate: learnerRate ?? video.playbackRate, ad }
  }

  const notify = () => {
    const playback = snapshot()
    for (const listener of listeners) listener(playback)
  }

  const running = () => listeners.size > 0 && video !== null && snapshot()?.playing === true

  const tick = () => {
    frame = null
    if (!running()) return
    notify()
    frame = frames.requestAnimationFrame(tick)
  }

  const schedule = () => {
    if (frame === null && running()) frame = frames.requestAnimationFrame(tick)
  }

  const changed = () => {
    notify()
    schedule()
  }

  const restoreRate = () => {
    if (!video || ad || loading || learnerRate === null) return
    if (video.playbackRate !== learnerRate) video.playbackRate = learnerRate
  }

  const onRateChange = () => {
    if (video && !ad && !loading) learnerRate = video.playbackRate
    changed()
  }

  const onLoadStart = () => {
    loading = true
  }

  const onLoadedMetadata = () => {
    loading = false
    restoreRate()
    changed()
  }

  const applySiteCaptions = () => {
    if (!player) return
    if (siteCaptionsShown) {
      player.removeAttribute(siteCaptionsAttribute)
      return
    }
    player.setAttribute(siteCaptionsAttribute, 'hidden')
    if (style) return
    style = page.createElement('style')
    style.textContent = siteCaptionsRule
    ;(page.head ?? page.documentElement).append(style)
  }

  const adObserver = new MutationObserver(() => {
    const showing = player?.classList.contains(adClass) ?? false
    if (showing === ad) return
    ad = showing
    restoreRate()
    changed()
  })

  const attach = (): boolean => {
    const foundPlayer = page.querySelector<HTMLElement>('#movie_player')
    const foundVideo = foundPlayer?.querySelector('video') ?? null
    if (!foundPlayer || !foundVideo) return false
    player = foundPlayer
    video = foundVideo
    ad = player.classList.contains(adClass)
    if (!ad) learnerRate = video.playbackRate
    for (const type of followedEvents) video.addEventListener(type, changed)
    video.addEventListener('ratechange', onRateChange)
    video.addEventListener('loadstart', onLoadStart)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    adObserver.observe(player, { attributes: true, attributeFilter: ['class'] })
    applySiteCaptions()
    changed()
    return true
  }

  const playerWatch = new MutationObserver(() => {
    if (attach()) playerWatch.disconnect()
  })

  if (!attach()) playerWatch.observe(page.documentElement, { childList: true, subtree: true })

  const control = (act: (element: HTMLVideoElement) => void) => {
    if (video && !ad) act(video)
  }

  return {
    get playback() {
      return snapshot()
    },
    subscribe(listener) {
      listeners.add(listener)
      schedule()
      return () => listeners.delete(listener)
    },
    seek(time) {
      control(element => {
        element.currentTime = time
      })
    },
    play() {
      control(element => {
        element.play().catch(() => undefined)
      })
    },
    pause() {
      control(element => element.pause())
    },
    setRate(rate) {
      control(element => {
        learnerRate = rate
        element.playbackRate = rate
      })
    },
    captionHost: () => player,
    showSiteCaptions(shown) {
      siteCaptionsShown = shown
      applySiteCaptions()
    },
    stop() {
      playerWatch.disconnect()
      adObserver.disconnect()
      if (frame !== null) frames.cancelAnimationFrame(frame)
      frame = null
      for (const type of followedEvents) video?.removeEventListener(type, changed)
      video?.removeEventListener('ratechange', onRateChange)
      video?.removeEventListener('loadstart', onLoadStart)
      video?.removeEventListener('loadedmetadata', onLoadedMetadata)
      player?.removeAttribute(siteCaptionsAttribute)
      style?.remove()
      style = null
      video = null
      player = null
      for (const listener of listeners) listener(null)
      listeners.clear()
    }
  }
}
