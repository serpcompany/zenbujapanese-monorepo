import { captionsService } from '../captions/captions-service'
import { memoryStorage } from '../captions/fixtures/memory-storage'
import { netflixStandIn, trackHost } from '../captions/fixtures/netflix-stand-in'
import { youTubeStandIn } from '../captions/fixtures/youtube-stand-in'
import type {
  CaptionsAnswer,
  CaptionsChange,
  CaptionsEnvelope,
  CaptionsRequest
} from '../captions/messages'
import { askCaptions, askTabTracks } from '../captions/messages'
import { answerCaptions } from '../captions/serve-captions'
import {
  followVideoPage,
  type PageListener,
  type PlayerCaptions,
  type VideoSitePage
} from '../video/video-page'
import { youTubePage } from '../video/video-sites'
import { watchedVideo } from '../video/watch-page'
import { videoTabPortsStandIn } from './video-tab-ports'

type Options = {
  tabId?: number
  captionsOn?: boolean
  site?: VideoSitePage
  follow?: VideoSitePage['follow']
  contentScript?: boolean
  captions?: PlayerCaptions
}

export function watchedTab({
  tabId = 5,
  captionsOn = true,
  site = youTubePage,
  follow = site.follow,
  contentScript: injected = true,
  captions
}: Options = {}) {
  const youTube = youTubeStandIn()
  const netflix = netflixStandIn()
  const contentScript = new Set<PageListener>()
  const tabs = {
    sendMessage: (_tab: number, message: unknown) =>
      new Promise(resolve => {
        if (![...contentScript].some(listener => listener(message, {}, resolve))) resolve(undefined)
      })
  }
  const sidePanel = new Set<(change: CaptionsChange) => void>()
  const settings = { captionsOn }
  const opened: string[] = []
  const announced: string[] = []
  const ports = videoTabPortsStandIn()
  const serviceWorker = answerCaptions(
    captionsService({
      storage: memoryStorage(),
      fetch: (url, init) => (url.includes(trackHost) ? netflix : youTube).fetch(url, init),
      prepareRequests: async () => undefined,
      tabVideo: async () => watchedVideo(location.href),
      askTracks: (asked, videoId) => askTabTracks(asked, videoId, tabs),
      captionsOn: async () => settings.captionsOn,
      announce: change => {
        announced.push(change.captions.state)
        for (const listener of [...contentScript]) listener(change)
        for (const listener of [...sidePanel]) listener(structuredClone(change))
      },
      now: () => Date.now(),
      random: () => 0.5
    })
  )
  const sendFrom =
    (sender: { tab?: { id?: number } }) =>
    (message: CaptionsEnvelope): Promise<CaptionsAnswer> =>
      new Promise(resolve => serviceWorker(message, sender, resolve))
  const load = () =>
    followVideoPage(
      document,
      { ...site, follow },
      {
        runtime: {
          sendMessage: message => {
            if (message.captions.type === 'video-opened') opened.push(message.captions.videoId)
            return sendFrom({ tab: { id: tabId } })(message)
          },
          onMessage: {
            addListener: listener => contentScript.add(listener),
            removeListener: listener => contentScript.delete(listener)
          },
          onConnect: ports.onConnect(tabId)
        },
        captions
      }
    )
  let stop = injected ? load() : () => undefined
  const fromPanel = { sendMessage: sendFrom({}) }
  return {
    tabId,
    youTube,
    netflix,
    settings,
    opened,
    announced,
    ports,
    stop: () => stop(),
    reload() {
      stop()
      stop = load()
    },
    askCaptions: (request: CaptionsRequest) => askCaptions(request, fromPanel),
    toContentScript(message: unknown) {
      for (const listener of [...contentScript]) listener(message)
    },
    watchCaptions(heard: (change: CaptionsChange) => void) {
      sidePanel.add(heard)
      return () => void sidePanel.delete(heard)
    }
  }
}
