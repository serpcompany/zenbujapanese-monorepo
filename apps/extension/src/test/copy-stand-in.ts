import type { Mutation, MutationResult, SyncedChange } from '@zenbu/account-rules/account-copy'
import { type CopyStorage, type Item, itemKey, type Meta } from '../service-worker/copy/kept'
import type { SettingsStore } from '../shared/settings'
import { keptItems } from './fake-chrome'

export function copyStorage() {
  const items = new Map<string, Item>()
  let meta: Meta | null = null
  let failing = false
  let saves = 0
  const storage: CopyStorage = {
    load: async () => ({
      items: [...items.values()].map(item => structuredClone(item)),
      meta: structuredClone(meta)
    }),
    save: async saved => {
      if (failing) throw new Error('The quota is used up.')
      saves += 1
      if (saved.replace) items.clear()
      for (const key of saved.remove) items.delete(key)
      for (const item of saved.put) items.set(itemKey(item), structuredClone(item))
      meta = structuredClone(saved.meta)
    }
  }
  return {
    storage,
    items,
    meta: () => meta,
    saves: () => saves,
    failSaves: (fail = true) => {
      failing = fail
    }
  }
}

export function settingsStore(initial: Record<string, unknown> = {}) {
  const items: Record<string, unknown> = { ...initial }
  const kept = keptItems(items)
  const listeners = new Set<(changes: Record<string, unknown>) => void>()
  let failing = 0
  const store: SettingsStore = {
    get: kept.get,
    set: async next => {
      if (failing > 0) {
        failing -= 1
        throw new Error('The browser refused the write.')
      }
      const changes = kept.write(next)
      for (const listener of [...listeners]) listener(changes)
    },
    onChanged: {
      addListener: listener => listeners.add(listener),
      removeListener: listener => listeners.delete(listener)
    }
  }
  return {
    store,
    items,
    failWrites: (times: number) => {
      failing = times
    }
  }
}

export type Sync = { cursor: string | null; limit: number; mutations: Mutation[] }

export const appliedTo = (body: Sync, version = 1): MutationResult[] =>
  body.mutations.map(mutation => ({ id: mutation.id, status: 'applied', version }))

export const syncAnswer = (
  results: MutationResult[],
  changes: SyncedChange[] = [],
  cursor = 'cursor-1',
  hasMore = false
) => ({ results, changes, cursor, hasMore })

export const quietCopyParts = () => ({
  storage: copyStorage().storage,
  settings: settingsStore().store,
  tabs: { query: async () => [], sendMessage: async () => undefined },
  pages: { sendMessage: async () => undefined }
})
