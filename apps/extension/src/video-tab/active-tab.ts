import { useEffect, useState } from 'react'
import { type VideoSite, watchedVideo } from '../video/watch-page'
import type { ActiveTab, VideoTabServices } from './services'

export type WatchedVideo = { tabId: number; videoId: string; title: string | null }

const unreadCount = /^\(\d+\)\s+/

const siteNames: Record<VideoSite, string> = { youtube: 'YouTube', netflix: 'Netflix' }

function titleOf(title: string | undefined, site: VideoSite): string | null {
  const siteName = siteNames[site]
  const siteSuffix = ` - ${siteName}`
  const plain = (title ?? '').replace(unreadCount, '').trim()
  const shown = plain.endsWith(siteSuffix) ? plain.slice(0, -siteSuffix.length).trim() : plain
  return shown === '' || shown === siteName ? null : shown
}

export function watchedIn(tab: ActiveTab | null): WatchedVideo | null {
  const watched = watchedVideo(tab?.url)
  if (!tab || watched === null) return null
  return { tabId: tab.id, videoId: watched.videoId, title: titleOf(tab.title, watched.site) }
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
