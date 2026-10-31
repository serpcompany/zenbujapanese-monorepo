import { act } from 'react'
import { vi } from 'vitest'
import type { SavingRefusal } from '../shared/account-copy'
import type { ShareServices } from '../video-tab/known-share'

type Known = Record<string, boolean> | null

export function shareStandIn(counted: Record<string, string[]>, refusal: SavingRefusal | null) {
  const known = new Set<string>()
  const knownHeard = new Set<(known: Known) => void>()
  const savingHeard = new Set<(refusal: SavingRefusal | null) => void>()
  let refused = refusal
  const services = {
    knownWords: vi.fn<ShareServices['knownWords']>(async items =>
      Object.fromEntries(items.map(item => [item, known.has(item)]))
    ),
    watchKnown: (heard: (known: Known) => void) => {
      knownHeard.add(heard)
      return () => void knownHeard.delete(heard)
    },
    countWords: vi.fn<ShareServices['countWords']>(async lines => ({
      type: 'counted-words',
      ids: lines.flatMap(line => counted[line] ?? [])
    })),
    savingRefusal: vi.fn<ShareServices['savingRefusal']>(async () => refused),
    watchSaving: (heard: (refusal: SavingRefusal | null) => void) => {
      savingHeard.add(heard)
      return () => void savingHeard.delete(heard)
    }
  } satisfies Omit<ShareServices, 'wait'>
  return {
    services,
    async knows(change: Known) {
      for (const [id, now] of Object.entries(change ?? {})) {
        if (now) known.add(id)
        else known.delete(id)
      }
      await act(async () => {
        for (const heard of [...knownHeard]) heard(change)
      })
    },
    async refuse(next: SavingRefusal | null) {
      refused = next
      await act(async () => {
        for (const heard of [...savingHeard]) heard(next)
      })
    }
  }
}
