import type { Playback, VideoFollower } from './follower'

export const siteCaptionsAttribute = 'data-zenbu-site-captions'

export type PlayerControls = Pick<VideoFollower, 'seek' | 'play' | 'pause' | 'setRate'>

export type PlayerSite = {
  player: string
  siteCaptionsRule: string
  adClass?: string
  holdsRateThroughSeeks?: boolean
  controls(video: HTMLVideoElement): PlayerControls
}

export type Frames = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>

const followedEvents = ['play', 'pause', 'playing', 'seeked', 'timeupdate', 'ended', 'emptied']

const seekSettles = 1_000

type Listener = (playback: Playback | null) => void

export function elementFollower(
  page: Document,
  videoId: string,
  site: PlayerSite,
  frames: Frames = page.defaultView ?? window,
  now: () => number = Date.now
): VideoFollower {
  const listeners = new Set<Listener>()
  let player: HTMLElement | null = null
  let video: HTMLVideoElement | null = null
  let controls: PlayerControls | null = null
  let ad = false
  let loading = false
  let learnerRate: number | null = null
  let seekingUntil = 0
  let heldTime = 0
  let siteCaptionsShown = true
  let frame: number | null = null
  let style: HTMLStyleElement | null = null

  const adShowing = () =>
    site.adClass ? (player?.classList.contains(site.adClass) ?? false) : false

  const snapshot = (): Playback | null => {
    if (!video) return null
    if (!ad) heldTime = video.currentTime
    const playing = !ad && !video.paused && !video.ended
    return {
      videoId,
      time: heldTime,
      playing,
      rate: learnerRate ?? video.playbackRate,
      ad,
      ended: !ad && video.ended
    }
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
    if (video.playbackRate !== learnerRate) controls?.setRate(learnerRate)
  }

  const onRateChange = () => {
    if (video && !ad && !loading) {
      if (site.holdsRateThroughSeeks && now() < seekingUntil) restoreRate()
      else learnerRate = video.playbackRate
    }
    changed()
  }

  const onSeeking = () => {
    seekingUntil = Number.POSITIVE_INFINITY
  }

  const onSeeked = () => {
    seekingUntil = now() + seekSettles
    restoreRate()
  }

  const onLoadStart = () => {
    loading = true
    seekingUntil = 0
  }

  const onLoadedMetadata = () => {
    loading = false
    restoreRate()
    changed()
  }

  const mediaListeners: [string, () => void][] = [
    ...followedEvents.map((type): [string, () => void] => [type, changed]),
    ['ratechange', onRateChange],
    ['loadstart', onLoadStart],
    ['loadedmetadata', onLoadedMetadata],
    ...(site.holdsRateThroughSeeks
      ? ([
          ['seeking', onSeeking],
          ['seeked', onSeeked]
        ] satisfies [string, () => void][])
      : [])
  ]

  const applySiteCaptions = () => {
    if (!player) return
    if (siteCaptionsShown) {
      player.removeAttribute(siteCaptionsAttribute)
      return
    }
    player.setAttribute(siteCaptionsAttribute, 'hidden')
    if (style) return
    style = page.createElement('style')
    style.textContent = site.siteCaptionsRule
    ;(page.head ?? page.documentElement).append(style)
  }

  const adObserver = new MutationObserver(() => {
    const showing = adShowing()
    if (showing === ad) return
    ad = showing
    restoreRate()
    changed()
  })

  const detach = () => {
    adObserver.disconnect()
    for (const [type, listener] of mediaListeners) video?.removeEventListener(type, listener)
    player?.removeAttribute(siteCaptionsAttribute)
  }

  const attach = () => {
    const foundPlayer = page.querySelector<HTMLElement>(site.player)
    const foundVideo = foundPlayer?.querySelector('video') ?? null
    if (!foundPlayer || !foundVideo) return
    const swapped = video !== null
    detach()
    player = foundPlayer
    video = foundVideo
    controls = site.controls(foundVideo)
    loading = false
    seekingUntil = 0
    ad = adShowing()
    if (!ad && !swapped) learnerRate = video.playbackRate
    for (const [type, listener] of mediaListeners) video.addEventListener(type, listener)
    if (site.adClass) adObserver.observe(player, { attributes: true, attributeFilter: ['class'] })
    applySiteCaptions()
    if (swapped) restoreRate()
    changed()
  }

  const playerWatch = new MutationObserver(() => {
    if (!player?.isConnected || !video?.isConnected) attach()
  })

  attach()
  playerWatch.observe(page.documentElement, { childList: true, subtree: true })

  const control = (act: (to: PlayerControls) => void) => {
    if (controls && !ad) act(controls)
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
    seek: time => control(to => to.seek(time)),
    play: () => control(to => to.play()),
    pause: () => control(to => to.pause()),
    setRate(rate) {
      control(to => {
        learnerRate = rate
        to.setRate(rate)
      })
    },
    captionHost: () => player,
    showSiteCaptions(shown) {
      siteCaptionsShown = shown
      applySiteCaptions()
    },
    stop() {
      playerWatch.disconnect()
      if (frame !== null) frames.cancelAnimationFrame(frame)
      frame = null
      detach()
      style?.remove()
      style = null
      video = null
      controls = null
      player = null
      for (const listener of listeners) listener(null)
      listeners.clear()
    }
  }
}
