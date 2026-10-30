import type { ReactNode } from 'react'
import { vi } from 'vitest'
import {
  type CopiedNote,
  type CopyAnswer,
  type CopyChange,
  favoritesList,
  type SavingRefusal,
  type SavingRefused,
  type WordState,
  type WordView
} from '../shared/account-copy'
import { type SavingPort, SavingProvider } from '../word-saving/saving'

type Listeners<Told> = Set<(told: Told) => void>

const listenTo =
  <Told,>(listeners: Listeners<Told>) =>
  (listener: (told: Told) => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }

export function savingStandIn(page = 'https://example.com/') {
  const states = new Map<string, WordState>()
  const lists = [{ id: favoritesList, name: 'Favorites', words: new Set<string>() }]
  const notes = new Map<string, CopiedNote>()
  const changes: CopyChange[] = []
  const knownHeard: Listeners<Record<string, boolean> | null> = new Set()
  const refusedHeard: Listeners<SavingRefused> = new Set()
  let refusal: SavingRefusal | null = null
  const view = (item: string): WordView => ({
    state: states.get(item) ?? 'unknown',
    lists: lists.map(({ id, name, words }) => ({ id, name, holds: words.has(item) })),
    notes: [...notes.values()].filter(note => note.item === item),
    refusal
  })
  function apply(item: string, change: CopyChange) {
    if (change.change === 'set') {
      const was = states.get(item) === 'known'
      states.set(item, change.state)
      if (was !== (change.state === 'known')) {
        for (const heard of knownHeard) heard({ [item]: !was })
      }
    }
    if (change.change === 'add-word') {
      const list = lists.find(kept => kept.id === change.list)
      if (list) list.words.add(item)
      else lists.push({ id: change.list, name: change.name ?? '', words: new Set([item]) })
    }
    if (change.change === 'remove-word') {
      lists.find(kept => kept.id === change.list)?.words.delete(item)
    }
    if (change.change === 'write-note') {
      const { note, text, headword, reading } = change
      notes.set(note, { id: note, item, text, headword, reading })
    }
    if (change.change === 'delete-note') notes.delete(change.note)
  }
  const port: SavingPort = {
    ask: async item => view(item),
    change: async (item, change): Promise<CopyAnswer> => {
      if (refusal) return { type: 'refused', refusal }
      changes.push(change)
      apply(item, change)
      return { type: 'changed' }
    },
    onKnown: listenTo(knownHeard),
    onRefused: listenTo(refusedHeard),
    signIn: vi.fn(),
    page: () => page
  }
  return {
    port,
    changes,
    view,
    refuse(next: SavingRefusal | null) {
      refusal = next
    },
    tell(told: Omit<SavingRefused, 'target'>) {
      for (const heard of refusedHeard) heard({ target: 'saving', ...told })
    }
  }
}

export function WithSaving({ port, children }: { port?: SavingPort; children: ReactNode }) {
  return <SavingProvider port={port ?? savingStandIn().port}>{children}</SavingProvider>
}
