import { failure } from '../shared/messages'
import type { SiteVideo } from '../video/watch-page'
import { nextRateLimit } from './backoff'
import { captionLabels } from './labels'
import type {
  CaptionsAnswer,
  CaptionsChange,
  CaptionsRequest,
  CaptionsState,
  CaptionTracks,
  NoVideo
} from './messages'
import { fetchNetflixCaptions } from './netflix-requests'
import { captionsStore, type SessionStorage, type TabCaptions } from './session-store'
import { type Fetch, fetchYouTubeCaptions } from './youtube-requests'

type Mode = 'when-due' | 'now'

export type CaptionsDependencies = {
  storage: SessionStorage
  fetch: Fetch
  prepareRequests(): Promise<void>
  tabVideo(tabId: number): Promise<SiteVideo | null>
  askTracks(tabId: number, videoId: string): Promise<CaptionTracks>
  captionsOn(): Promise<boolean>
  announce(change: CaptionsChange): void
  now(): number
  random(): number
}

type Queue = <T>(task: () => Promise<T>) => Promise<T>

const noVideo: NoVideo = { state: 'no-video' }

const ignore = () => undefined

function queue(): Queue {
  let last: Promise<unknown> = Promise.resolve()
  return task => {
    const result = last.then(task)
    last = result.catch(ignore)
    return result
  }
}

const loading = (videoId: string): CaptionsState => ({ state: 'loading', videoId })

const rateLimited = (videoId: string, retryAt: number): CaptionsState => ({
  state: 'rate-limited',
  videoId,
  retryAt
})

const failed = (videoId: string, reason: string): CaptionsState => ({
  state: 'failed',
  videoId,
  reason
})

const sameState = (before: CaptionsState | null, after: CaptionsState) =>
  before?.state === after.state &&
  (before.state !== 'rate-limited' ||
    after.state !== 'rate-limited' ||
    before.retryAt === after.retryAt)

export function captionsService(dependencies: CaptionsDependencies) {
  const store = captionsStore(dependencies.storage)
  const youTube = queue()
  const tabs = new Map<number, Queue>()
  const fetching = new Map<number, string>()

  const forTab = (tabId: number): Queue => {
    const existing = tabs.get(tabId)
    if (existing) return existing
    const created = queue()
    tabs.set(tabId, created)
    return created
  }

  const announce = (tabId: number, captions: CaptionsState) =>
    dependencies.announce({ target: 'captions', tabId, captions })

  function fromYouTube(videoId: string, mode: Mode): Promise<CaptionsState> {
    return youTube(async () => {
      const limit = await store.rateLimit()
      if (mode === 'when-due' && limit && dependencies.now() < limit.retryAt)
        return rateLimited(videoId, limit.retryAt)
      await dependencies.prepareRequests()
      const fetched = await fetchYouTubeCaptions(videoId, dependencies.fetch)
      if (fetched.state === 'rate-limited') {
        const next = nextRateLimit(limit, dependencies.now(), dependencies.random)
        await store.setRateLimit(next)
        return rateLimited(videoId, next.retryAt)
      }
      if (limit) await store.setRateLimit(undefined)
      return { ...fetched, videoId }
    })
  }

  const fromNetflix = (tabId: number, videoId: string) =>
    fetchNetflixCaptions(dependencies.askTracks(tabId, videoId), dependencies.fetch).then(
      (fetched): CaptionsState => ({ ...fetched, videoId })
    )

  function requestCaptions(tabId: number, video: SiteVideo, mode: Mode): Promise<CaptionsState> {
    const { videoId } = video
    const requested =
      video.site === 'netflix' ? fromNetflix(tabId, videoId) : fromYouTube(videoId, mode)
    return requested.catch((error: unknown) => failed(videoId, failure(error).reason))
  }

  const settle = (tabId: number, videoId: string, captions: CaptionsState) =>
    forTab(tabId)(async () => {
      if (fetching.get(tabId) === videoId) fetching.delete(tabId)
      const stored = await store.tab(tabId)
      if (stored?.videoId !== videoId) return
      await store.setTab(tabId, { ...stored, captions })
      announce(tabId, captions)
    })

  function start(tabId: number, video: SiteVideo, mode: Mode) {
    const { videoId } = video
    fetching.set(tabId, videoId)
    requestCaptions(tabId, video, mode)
      .then(captions => settle(tabId, videoId, captions))
      .catch(() => {
        const unsaved = failed(videoId, captionLabels.failed.unsaved)
        return settle(tabId, videoId, unsaved).catch(() => announce(tabId, unsaved))
      })
  }

  function needsRequest(tabId: number, captions: CaptionsState, mode: Mode): boolean {
    if (captions.state === 'loading') return fetching.get(tabId) !== captions.videoId
    if (captions.state === 'failed') return mode === 'now'
    return captions.state === 'rate-limited'
  }

  async function nextState(tabId: number, tab: TabCaptions, mode: Mode): Promise<CaptionsState> {
    if (tab.captions && !needsRequest(tabId, tab.captions, mode)) return tab.captions
    const limit =
      mode === 'when-due' && tab.site === 'youtube' ? await store.rateLimit() : undefined
    if (limit && dependencies.now() < limit.retryAt) return rateLimited(tab.videoId, limit.retryAt)
    return loading(tab.videoId)
  }

  const open = (tabId: number, video: SiteVideo, asked: boolean, mode: Mode) =>
    forTab(tabId)(async (): Promise<CaptionsState> => {
      const { videoId } = video
      const stored = await store.tab(tabId)
      const tab: TabCaptions =
        stored?.videoId === videoId && stored.site === video.site
          ? { ...stored, asked: stored.asked || asked }
          : { ...video, asked, captions: null }
      if (!tab.asked && !(await dependencies.captionsOn())) {
        const kept = tab.captions?.state === 'rate-limited' ? null : tab.captions
        await store.setTab(tabId, { ...tab, captions: kept })
        return kept ?? loading(videoId)
      }
      const captions = await nextState(tabId, tab, mode)
      await store.setTab(tabId, { ...tab, captions })
      if (!sameState(tab.captions, captions)) announce(tabId, captions)
      if (captions.state === 'loading' && fetching.get(tabId) !== videoId) start(tabId, video, mode)
      return captions
    })

  async function answer(request: CaptionsRequest, senderTab?: number): Promise<CaptionsAnswer> {
    if (request.type === 'video-opened') {
      if (senderTab === undefined) return failure('Only a tab opens a video.')
      const { site, videoId } = request
      return open(senderTab, { site, videoId }, false, 'when-due')
    }
    const video = await dependencies.tabVideo(request.tabId)
    if (video === null) return noVideo
    return open(request.tabId, video, true, request.type === 'try-again' ? 'now' : 'when-due')
  }

  async function openVideosAgain(): Promise<void> {
    for (const tabId of await store.tabIds()) {
      const video = await dependencies.tabVideo(tabId)
      if (video !== null) await open(tabId, video, false, 'when-due')
    }
  }

  function tabClosed(tabId: number): Promise<void> {
    fetching.delete(tabId)
    return forTab(tabId)(() => store.forgetTab(tabId)).finally(() => tabs.delete(tabId))
  }

  return { answer, openVideosAgain, tabClosed }
}

export type CaptionsService = ReturnType<typeof captionsService>
