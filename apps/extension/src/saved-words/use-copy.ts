import { useCallback, useEffect, useRef, useState } from 'react'
import { askCopy, type CopyView, onCopyChanged, type WordState } from '../shared/account-copy'

export type SavedCopy = {
  copy: CopyView | null
  unread: boolean
  syncing: boolean
  syncNow(): void
  readAgain(): void
}

export function useCopy(): SavedCopy {
  const [copy, setCopy] = useState<CopyView | null>(null)
  const [unread, setUnread] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const read = useRef<() => void>(() => undefined)
  useEffect(() => {
    let live = true
    let asked = 0
    read.current = () => {
      const id = ++asked
      void askCopy({ copy: 'read' }).then(answer => {
        if (!live || id !== asked) return
        if (answer.type === 'copy') setCopy(answer.copy)
        setUnread(answer.type !== 'copy')
      })
    }
    read.current()
    const stop = onCopyChanged(() => read.current())
    return () => {
      live = false
      stop()
    }
  }, [])
  const syncNow = useCallback(() => {
    setSyncing(true)
    void askCopy({ copy: 'sync' }).then(() => {
      setSyncing(false)
      read.current()
    })
  }, [])
  const readAgain = useCallback(() => read.current(), [])
  return { copy, unread, syncing, syncNow, readAgain }
}

export function statesIn(copy: CopyView): (item: string) => WordState {
  const states = new Map<string, WordState>([
    ...copy.learningWords.map(word => [word.item, 'learning'] as const),
    ...copy.knownWords.map(word => [word.item, 'known'] as const)
  ])
  return item => states.get(item) ?? 'unknown'
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000]
]

export function syncedAgo(at: number, now: number): string {
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const passed = Math.max(0, now - at)
  const [unit, size] = units.find(([, size]) => passed >= size) ?? ['second', 1]
  return format.format(unit === 'second' ? 0 : -Math.floor(passed / size), unit)
}
