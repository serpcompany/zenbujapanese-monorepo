'use client'

import type { ComponentType } from 'react'
import type { SyncedArea } from '@/lib/account/synced'
import { Bookmarks, RecentVideos } from './app-only'
import { DailyLists } from './daily-lists'
import { KnownWords } from './known-words'
import { ListWords } from './list-words'
import { Lists } from './lists'
import { MediaLibrary } from './media-library'
import { Notes } from './notes'
import type { AreaProps } from './parts'
import { RecentSearches } from './recent-searches'
import { Settings } from './settings'

function ListsOrOne(props: AreaProps) {
  if (props.listId) return <ListWords {...props} listId={props.listId} />
  return props.dailyLists ? <DailyLists {...props} /> : <Lists {...props} />
}

export const areaViews: Readonly<Record<SyncedArea, ComponentType<AreaProps>>> = {
  knownWords: KnownWords,
  lists: ListsOrOne,
  notes: Notes,
  mediaLibrary: MediaLibrary,
  recentVideos: RecentVideos,
  bookmarks: Bookmarks,
  recentSearches: RecentSearches,
  settings: Settings
}
