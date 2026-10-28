import { useEffect, useState } from 'react'
import { watchedVideoId } from '../video/watch-page'
import type { ActiveTab, VideoTabServices } from './services'

export type WatchedVideo = { tabId: number; videoId: string; title: string | null }

const unreadCount = /^\(\d+\)\s+/

const siteName = 'YouTube'

const siteSuffix = ` - ${siteName}`

function titleOf(title: string | undefined): string | null {
  const plain = (title ?? '').replace(unreadCount, '').trim()
  const shown = plain.endsWith(siteSuffix) ? plain.slice(0, -siteSuffix.length).trim() : plain
  return shown === '' || shown === siteName ? null : shown
}

export function watchedIn(tab: ActiveTab | null): WatchedVideo | null {
  const videoId = watchedVideoId(tab?.url)
  if (!tab || videoId === null) return null
  return { tabId: tab.id, videoId, title: titleOf(tab.title) }
}

export function useActiveTab(
  services: VideoTabServices,
  on: boolean
): ActiveTab | null | undefined {
  const [tab, setTab] = useState<ActiveTab | null | undefined>(undefined)
  useEffect(() => {
    if (!on) return
    let live = true
    let latest = 0
    const read = () => {
      latest += 1
      const asked = latest
      Promise.resolve()
        .then(() => services.activeTab())
        .catch(() => null)
        .then(found => {
          if (live && asked === latest) setTab(found)
        })
    }
    const stop = services.watchActiveTab(read)
    read()
    return () => {
      live = false
      stop()
    }
  }, [services, on])
  return tab
}
