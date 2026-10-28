import { captionsService } from '../captions/captions-service'
import { memoryStorage } from '../captions/fixtures/memory-storage'
import { youTubeStandIn } from '../captions/fixtures/youtube-stand-in'
import type {
  CaptionsAnswer,
  CaptionsChange,
  CaptionsEnvelope,
  CaptionsRequest
} from '../captions/messages'
import { askCaptions } from '../captions/messages'
import { answerCaptions } from '../captions/serve-captions'
import { watchedVideoId } from '../video/watch-page'
import type { youTubeFollower } from '../video/youtube-follower'
import { followYouTubePage } from '../video/youtube-page'
import { videoTabPortsStandIn } from './video-tab-ports'

type ContentListener = (message: unknown) => false

type Options = { tabId?: number; captionsOn?: boolean; follow?: typeof youTubeFollower }

export function watchedTab({ tabId = 5, captionsOn = true, follow }: Options = {}) {
  const youTube = youTubeStandIn()
  const contentScript = new Set<ContentListener>()
  const sidePanel = new Set<(change: CaptionsChange) => void>()
  const settings = { captionsOn }
  const opened: string[] = []
  const announced: string[] = []
  const ports = videoTabPortsStandIn()
  const serviceWorker = answerCaptions(
    captionsService({
      storage: memoryStorage(),
      fetch: youTube.fetch,
      prepareRequests: async () => undefined,
      tabVideo: async () => watchedVideoId(location.href),
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
  const stop = followYouTubePage(document, {
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
    follow
  })
  const fromPanel = { sendMessage: sendFrom({}) }
  return {
    tabId,
    youTube,
    settings,
    opened,
    announced,
    ports,
    stop,
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
