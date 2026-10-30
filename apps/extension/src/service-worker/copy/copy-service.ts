import type {
  CopiedList,
  CopiedNote,
  CopiedWord,
  CopyAnswer,
  CopyRequest,
  CopyView,
  KnownChanged
} from '../../shared/account-copy'
import { knownAtOnce } from '../../shared/account-copy'
import { readSettings, type SettingsStore } from '../../shared/settings'
import type { AccountStore, User } from '../account/store'
import type { AccessTokens } from '../account/tokens'
import { applyChange, changeOf, studyChanges } from './copy-changes'
import {
  type CopyStorage,
  type Draft,
  freshMeta,
  type Item,
  keptCopy,
  keyOf,
  ownedBy
} from './kept'
import { accountSync, type CopyFailure, type Reason } from './sync'
import { accountSettingsOf, reconcile } from './synced-settings'

export type CopyParts = {
  storage: CopyStorage
  store: AccountStore
  tokens: AccessTokens
  readSubscription(): Promise<boolean>
  settings: SettingsStore
  tell(changed: KnownChanged): void
  reportFailure(code: CopyFailure, status?: number): void
  later?: (run: () => void, wait: number) => void
  now?: () => number
  random?: () => number
  newId?: () => string
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

const textOrNull = (value: unknown) => (typeof value === 'string' ? value : null)

const knownIn = (draft: Draft, item: string) =>
  draft.get(keyOf('knownWord', item))?.data?.known === true

const shown = (items: Item[], entity: Item['entity']) =>
  items.filter(item => item.entity === entity && item.data !== null)

const wordOf = (data: Record<string, unknown>): CopiedWord => ({
  item: text(data.itemId),
  headword: text(data.headword),
  reading: text(data.reading)
})

function listsOf(items: Item[]): CopiedList[] {
  const words = shown(items, 'listWord')
  return shown(items, 'list')
    .map(({ entityId, data }) => ({
      id: entityId,
      name: text(data?.name),
      position: typeof data?.position === 'number' ? data.position : 0,
      createdAt: text(data?.createdAt),
      words: words
        .filter(word => word.entityId.startsWith(`${entityId}/`))
        .map(word => ({ ...wordOf(word.data ?? {}), addedAt: text(word.data?.addedAt) }))
    }))
    .sort(
      (first, second) =>
        first.position - second.position ||
        first.createdAt.localeCompare(second.createdAt) ||
        first.id.localeCompare(second.id)
    )
}

const notesOf = (items: Item[]): CopiedNote[] =>
  shown(items, 'wordNote').map(({ entityId, data }) => ({
    id: entityId,
    item: text(data?.itemId),
    text: text(data?.text),
    headword: textOrNull(data?.headword),
    reading: textOrNull(data?.reading)
  }))

export function accountCopy(parts: CopyParts) {
  const now = parts.now ?? Date.now
  const newId = parts.newId ?? (() => crypto.randomUUID())
  const copy = keptCopy(parts.storage, parts.store.inTurn)
  const sync = accountSync({
    copy,
    store: parts.store,
    tokens: parts.tokens,
    readSubscription: parts.readSubscription,
    settings: parts.settings,
    tell: known => parts.tell({ target: 'known', known }),
    reportFailure: parts.reportFailure,
    later: parts.later ?? ((run, wait) => void setTimeout(run, wait)),
    now,
    random: parts.random ?? Math.random,
    newId
  })
  const clock = { newId, now: () => new Date(now()).toISOString() }

  const signedInAsOwner = async (draft: Draft) =>
    draft.meta !== null && (await parts.store.keptAccount())?.user.id === draft.meta.userId

  async function view(): Promise<CopyView> {
    const signedIn = (await parts.store.sessionToken()) !== null
    return copy.look(draft => {
      const items = draft.all()
      return {
        owner: draft.meta?.email ?? null,
        knownWords: shown(items, 'knownWord')
          .filter(item => item.data?.known === true)
          .map(item => wordOf(item.data ?? {})),
        lists: listsOf(items),
        notes: notesOf(items),
        accountSettings: accountSettingsOf(items),
        unsynced: studyChanges(draft.meta?.queue ?? []),
        lastSyncedAt: draft.meta?.lastSyncedAt ?? null,
        sync: signedIn ? sync.state() : 'signed-out'
      }
    })
  }

  async function signedIn(user: User): Promise<void> {
    if (await copy.edit(draft => ownedBy(draft, user))) parts.tell({ target: 'known', known: null })
  }

  async function keptUser(): Promise<User | null> {
    if ((await parts.store.sessionToken()) === null) return null
    return (await parts.store.keptAccount())?.user ?? null
  }

  async function settingsChanged(): Promise<void> {
    const browser = await readSettings(parts.settings)
    const queued = await copy.edit(async draft => {
      if (!(await signedInAsOwner(draft))) return false
      const writes = reconcile(draft, browser, newId)
      if (Object.keys(writes).length > 0) await parts.settings.set(writes)
      return draft.meta?.queue.some(each => !each.sent) === true
    })
    if (queued) await sync.chance('settings')
  }

  async function change(raw: unknown): Promise<CopyAnswer> {
    const asked = changeOf(raw)
    if (asked === null) return { type: 'refused', refusal: 'invalid' }
    const word = asked.change === 'mark' || asked.change === 'clear' ? asked.item : null
    const outcome = await copy.edit(async draft => {
      const user = await keptUser()
      if (user && ownedBy(draft, user)) parts.tell({ target: 'known', known: null })
      if (draft.meta === null) return 'no-copy' as const
      const was = word !== null && knownIn(draft, word)
      if (!applyChange(draft, asked, clock)) return 'invalid' as const
      return word !== null && knownIn(draft, word) !== was ? { [word]: !was } : null
    })
    if (outcome === 'no-copy' || outcome === 'invalid') return { type: 'refused', refusal: outcome }
    if (outcome) parts.tell({ target: 'known', known: outcome })
    void sync.chance('change')
    return { type: 'changed' }
  }

  const known = (items: string[]) =>
    copy.look(draft =>
      Object.fromEntries(items.slice(0, knownAtOnce).map(item => [item, knownIn(draft, item)]))
    )

  async function answer(request: CopyRequest): Promise<CopyAnswer> {
    switch (request.copy) {
      case 'read':
        return { type: 'copy', copy: await view() }
      case 'change':
        return change(request.change)
      case 'sync':
        await sync.chance('sync-now')
        return { type: 'copy', copy: await view() }
      case 'opened':
        void sync.chance('opened')
        return { type: 'opened' }
      case 'known':
        return { type: 'known', known: await known(request.items) }
    }
  }

  async function forget(): Promise<void> {
    await copy.edit(draft => {
      if (draft.meta) draft.meta = freshMeta({ id: draft.meta.userId, email: draft.meta.email })
    })
  }

  const chance = (reason: Reason) => void sync.chance(reason)

  return { answer, signedIn, settingsChanged, forget, chance }
}

export type AccountCopy = ReturnType<typeof accountCopy>
