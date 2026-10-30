import type { Mutation } from '@zenbu/account-rules/account-copy'

const entities = ['knownWord', 'list', 'listWord', 'wordNote', 'setting'] as const

export type Entity = (typeof entities)[number]

export const isEntity = (value: unknown): value is Entity =>
  (entities as readonly unknown[]).includes(value)

export type Data = Record<string, unknown>

export type Item = { entity: Entity; entityId: string; version: number; data: Data | null }

export type Queued = { mutation: Mutation; sent: boolean; before: Item | null }

export type Meta = {
  userId: string
  email: string
  cursor: string | null
  lastSyncedAt: number | null
  fullRead: string[] | null
  held: Item[]
  deferred: Item[]
  refused: Record<string, string>
  queue: Queued[]
}

export type Saved = { put: Item[]; remove: string[]; meta: Meta | null; replace: boolean }

export type CopyStorage = {
  load(): Promise<{ items: Item[]; meta: Meta | null }>
  save(saved: Saved): Promise<void>
}

export const keyOf = (entity: string, entityId: string) => `${entity}:${entityId}`

export const itemKey = (item: { entity: string; entityId: string }) =>
  keyOf(item.entity, item.entityId)

export const queuedKey = (queued: Queued) => itemKey(queued.mutation)

export const freshMeta = (user: { id: string; email: string }): Meta => ({
  userId: user.id,
  email: user.email,
  cursor: null,
  lastSyncedAt: null,
  fullRead: [],
  held: [],
  deferred: [],
  refused: {},
  queue: []
})

export function ownedBy(draft: Draft, user: { id: string; email: string }): boolean {
  if (draft.meta?.userId === user.id) {
    draft.meta.email = user.email
    return false
  }
  draft.replace(freshMeta(user))
  return true
}

type Kept = { items: Map<string, Item>; meta: Meta | null }

export class Draft {
  private readonly changed = new Map<string, Item | null>()
  private replaced = false
  meta: Meta | null

  constructor(
    private readonly base: ReadonlyMap<string, Item>,
    meta: Meta | null
  ) {
    this.meta = meta === null ? null : structuredClone(meta)
  }

  get(key: string): Item | undefined {
    if (this.changed.has(key)) return this.changed.get(key) ?? undefined
    return this.replaced ? undefined : this.base.get(key)
  }

  put(item: Item): void {
    this.changed.set(itemKey(item), item)
  }

  remove(key: string): void {
    this.changed.set(key, null)
  }

  replace(meta: Meta | null): void {
    this.replaced = true
    this.changed.clear()
    this.meta = meta
  }

  all(): Item[] {
    const merged = new Map(this.replaced ? [] : this.base)
    for (const [key, item] of this.changed) {
      if (item) merged.set(key, item)
      else merged.delete(key)
    }
    return [...merged.values()]
  }

  saved(): Saved {
    const put = [...this.changed.values()].filter(item => item !== null)
    const remove = [...this.changed].filter(([, item]) => item === null).map(([key]) => key)
    return { put, remove, meta: this.meta, replace: this.replaced }
  }

  commit(kept: Kept): void {
    if (this.replaced) kept.items.clear()
    for (const [key, item] of this.changed) {
      if (item) kept.items.set(key, item)
      else kept.items.delete(key)
    }
    kept.meta = this.meta
  }
}

type InTurn = <T>(work: () => Promise<T>) => Promise<T>

export function keptCopy(storage: CopyStorage, inTurn: InTurn) {
  let loading: Promise<Kept> | null = null

  const load = () => {
    loading ??= storage.load().then(
      ({ items, meta }) => ({ items: new Map(items.map(item => [itemKey(item), item])), meta }),
      (error: unknown) => {
        loading = null
        throw error
      }
    )
    return loading
  }

  const look = async <T>(read: (draft: Draft) => T): Promise<T> => {
    const kept = await load()
    return read(new Draft(kept.items, kept.meta))
  }

  const edit = <T>(work: (draft: Draft) => T | Promise<T>): Promise<T> =>
    inTurn(async () => {
      const kept = await load()
      const draft = new Draft(kept.items, kept.meta)
      const value = await work(draft)
      try {
        await storage.save(draft.saved())
      } catch (error) {
        loading = null
        throw error
      }
      draft.commit(kept)
      return value
    })

  return { look, edit }
}

export type KeptCopy = ReturnType<typeof keptCopy>
