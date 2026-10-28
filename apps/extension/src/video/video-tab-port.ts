import { afterTimeout, backoff, type Wait } from '../page-lookup/scan'
import type { Playback } from './follower'

export const videoTabPort = 'video-tab'

type PlaybackMessage = { target: 'video-tab'; playback: Playback | null }

type PortEvent<Listener> = {
  addListener(listener: Listener): void
  removeListener(listener: Listener): void
}

export type TabPort = {
  readonly name: string
  postMessage(message: PlaybackMessage): void
  disconnect(): void
  onDisconnect: PortEvent<() => void>
}

export type PanelPort = {
  disconnect(): void
  onMessage: PortEvent<(message: unknown) => void>
  onDisconnect: PortEvent<() => void>
}

type Connect = (tabId: number) => PanelPort

type PanelOptions = { connect?: Connect; lastError?: () => unknown; wait?: Wait }

const steadyInterval = 100

const jump = 1

type Fields = Partial<Record<string, unknown>>

const fields = (value: unknown): Fields | undefined =>
  typeof value === 'object' && value !== null ? (value as Fields) : undefined

function isPlayback(value: unknown): value is Playback | null {
  if (value === null) return true
  const playback = fields(value)
  return (
    typeof playback?.videoId === 'string' &&
    typeof playback.time === 'number' &&
    typeof playback.playing === 'boolean' &&
    typeof playback.rate === 'number' &&
    typeof playback.ad === 'boolean'
  )
}

function isPlaybackMessage(message: unknown): message is PlaybackMessage {
  const envelope = fields(message)
  return envelope?.target === 'video-tab' && 'playback' in envelope && isPlayback(envelope.playback)
}

const steadyPlay = (before: Playback | null, after: Playback | null) =>
  before !== null &&
  after !== null &&
  before.playing &&
  after.playing &&
  before.videoId === after.videoId &&
  before.rate === after.rate &&
  before.ad === after.ad &&
  Math.abs(after.time - before.time) < jump

function playbackPoster(port: TabPort, now: () => number) {
  let sent: { playback: Playback | null; at: number } | null = null
  return (playback: Playback | null) => {
    const at = now()
    if (sent && steadyPlay(sent.playback, playback) && at - sent.at < steadyInterval) return
    sent = { playback, at }
    port.postMessage({ target: 'video-tab', playback })
  }
}

export function videoTabPorts(now: () => number = () => performance.now()) {
  const posters = new Map<TabPort, (playback: Playback | null) => void>()
  return {
    get open() {
      return posters.size > 0
    },
    add(port: TabPort, playback: Playback | null) {
      const poster = playbackPoster(port, now)
      posters.set(port, poster)
      poster(playback)
    },
    remove(port: TabPort) {
      posters.delete(port)
    },
    send(playback: Playback | null) {
      for (const poster of posters.values()) poster(playback)
    },
    close() {
      for (const port of posters.keys()) port.disconnect()
      posters.clear()
    }
  }
}

const connectToTab: Connect = tabId =>
  chrome.tabs.connect(tabId, { name: videoTabPort, frameId: 0 })

export function openVideoTab(
  tabId: number,
  onPlayback: (playback: Playback | null) => void,
  options: PanelOptions = {}
): () => void {
  const connect = options.connect ?? connectToTab
  const lastError = options.lastError ?? (() => chrome.runtime.lastError)
  const delay = backoff(options.wait ?? afterTimeout)
  let port: PanelPort | null = null
  let closed = false

  const received = (message: unknown) => {
    if (!isPlaybackMessage(message)) return
    delay.reset()
    onPlayback(message.playback)
  }

  function opened() {
    if (closed) return
    const connected = connect(tabId)
    port = connected
    connected.onMessage.addListener(received)
    connected.onDisconnect.addListener(() => {
      lastError()
      if (port !== connected) return
      port = null
      onPlayback(null)
      delay.wait().then(opened)
    })
  }

  opened()
  return () => {
    closed = true
    port?.disconnect()
    port = null
  }
}
