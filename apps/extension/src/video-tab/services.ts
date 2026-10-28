import {
  askCaptions,
  type CaptionsAnswer,
  type CaptionsChange,
  type CaptionsRequest,
  isCaptionsChange
} from '../captions/messages'
import { onDeviceServices, type TranslateServices } from '../translate/services'
import type { VideoControl, VideoControlMessage } from '../video/controls'
import { type Following, openVideoTab } from '../video/video-tab-port'

export type ActiveTab = { id: number; url?: string; title?: string }

export type VideoTabServices = Pick<
  TranslateServices,
  'segment' | 'wait' | 'popupCard' | 'translate' | 'availability' | 'download'
> & {
  activeTab(): Promise<ActiveTab | null>
  watchActiveTab(changed: () => void): () => void
  askCaptions(request: CaptionsRequest): Promise<CaptionsAnswer>
  watchCaptions(heard: (change: CaptionsChange) => void): () => void
  followPlayback(tabId: number, following: Following): () => void
  control(tabId: number, control: VideoControl): void
  reload(tabId: number): void
}

type TabChange = { status?: string; url?: string; title?: string }

const ignore = () => undefined

async function activeTab(): Promise<ActiveTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id === undefined ? null : { id: tab.id, url: tab.url, title: tab.title }
}

function watchActiveTab(changed: () => void): () => void {
  const updated = (_tabId: number, change: TabChange) => {
    if (change.status === 'complete' || change.url !== undefined || change.title !== undefined)
      changed()
  }
  chrome.tabs.onActivated.addListener(changed)
  chrome.tabs.onUpdated.addListener(updated)
  return () => {
    chrome.tabs.onActivated.removeListener(changed)
    chrome.tabs.onUpdated.removeListener(updated)
  }
}

function watchCaptions(heard: (change: CaptionsChange) => void): () => void {
  const listener = (message: unknown) => {
    if (isCaptionsChange(message)) heard(message)
    return false
  }
  chrome.runtime.onMessage.addListener(listener)
  return () => chrome.runtime.onMessage.removeListener(listener)
}

function control(tabId: number, sent: VideoControl): void {
  const message: VideoControlMessage = { target: 'video', control: sent }
  Promise.resolve()
    .then(() => chrome.tabs.sendMessage(tabId, message))
    .catch(ignore)
}

function reload(tabId: number): void {
  Promise.resolve()
    .then(() => chrome.tabs.reload(tabId))
    .catch(ignore)
}

const { segment, wait, popupCard, translate, availability, download } = onDeviceServices

export const onDeviceVideoServices: VideoTabServices = {
  segment,
  wait,
  popupCard,
  translate,
  availability,
  download,
  activeTab,
  watchActiveTab,
  askCaptions: request => askCaptions(request),
  watchCaptions,
  followPlayback: (tabId, following) => openVideoTab(tabId, following),
  control,
  reload
}
