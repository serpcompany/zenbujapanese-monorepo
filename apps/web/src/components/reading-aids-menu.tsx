'use client'

import { BookAIcon } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { ReadingAid } from '@/lib/dictionary/detail/reading-aids'
import { applyReadingAids, parseReadingAids, readingAidStorageKey } from '@/lib/reading-aids'

// The Reading Aids settings, as the app's Account → Reading Aids lists them: Show Furigana and Show
// Romaji, then Show Word Meanings and Show Sentence Translations. The app keeps them on the device;
// the website keeps them in the browser (lib/reading-aids.ts) and applies a change at once by
// setting its attribute on <html>. Hide Furigana on Known Words needs accounts (#468).

const changed = 'zenbu:reading-aids'

/**
 * The settings this page last saved, for when the browser blocks storage: toggles then still work
 * for as long as the page stays open. Undefined until a save fails.
 */
let unsaved: string | undefined

/** The stored settings, or this page's own when storage is blocked. */
function stored(): string | null {
  if (unsaved !== undefined) return unsaved
  try {
    return window.localStorage.getItem(readingAidStorageKey)
  } catch {
    return null
  }
}

/** Saves the settings; when storage is blocked, keeps them for this page instead. */
function save(value: string) {
  try {
    window.localStorage.setItem(readingAidStorageKey, value)
    unsaved = undefined
  } catch {
    unsaved = value
  }
}

/**
 * Follows changes from this page and from other tabs. Another tab's change also applies to this
 * page's <html>, so its aids show or hide as the menu now says.
 */
function subscribe(onChange: () => void) {
  const fromAnotherTab = (event: StorageEvent) => {
    if (event.key !== readingAidStorageKey && event.key !== null) return
    // Another tab saved, so storage works: read it rather than this page's own copy.
    unsaved = undefined
    applyReadingAids(document.documentElement, parseReadingAids(stored()))
    onChange()
  }
  window.addEventListener('storage', fromAnotherTab)
  window.addEventListener(changed, onChange)
  return () => {
    window.removeEventListener('storage', fromAnotherTab)
    window.removeEventListener(changed, onChange)
  }
}

const groups: { label: string; items: { aid: ReadingAid; label: string }[] }[] = [
  {
    label: 'Reading Aids',
    items: [
      { aid: 'furigana', label: 'Show Furigana' },
      { aid: 'romaji', label: 'Show Romaji' }
    ]
  },
  {
    label: 'Meanings and Translations',
    items: [
      { aid: 'wordMeanings', label: 'Show Word Meanings' },
      { aid: 'translations', label: 'Show Sentence Translations' }
    ]
  }
]

export function ReadingAidsMenu() {
  // The server, and the first client render, show the defaults; the stored settings follow.
  const raw = useSyncExternalStore(subscribe, stored, () => null)
  const settings = parseReadingAids(raw)

  const set = (aid: ReadingAid, value: boolean) => {
    const next = { ...settings, [aid]: value }
    save(JSON.stringify(next))
    applyReadingAids(document.documentElement, next)
    window.dispatchEvent(new Event(changed))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Reading aids" data-reading-aids-menu />
        }
      >
        <BookAIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {groups.map((group, index) => (
          <DropdownMenuGroup key={group.label}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            {group.items.map(item => (
              <DropdownMenuCheckboxItem
                key={item.aid}
                checked={settings[item.aid]}
                onCheckedChange={value => set(item.aid, value)}
                data-reading-aid-setting={item.aid}
              >
                {item.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
