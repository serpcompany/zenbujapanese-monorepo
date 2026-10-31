import type {
  CopyAnswer,
  CopyChange,
  CopyRequest,
  CopyView,
  KnownChanged,
  SavingRefusal,
  WordView
} from '../../shared/account-copy'
import { knownAtOnce } from '../../shared/account-copy'
import { readSettings, type SettingsStore } from '../../shared/settings'
import type { AccountStore, User } from '../account/store'
import type { AccessTokens } from '../account/tokens'
import { applyChange, changeOf, studyChanges } from './copy-changes'
import { aboutOnly, listsOf, notesOf, wordsIn, wordViewOf } from './copy-view'
import { type CopyStorage, type Draft, freshMeta, keptCopy, keyOf, ownedBy } from './kept'
import { accountSync, type CopyFailure, type Reason } from './sync'
import { accountSettingsOf, reconcile } from './synced-settings'

export type CopyParts = {
  storage: CopyStorage
  store: AccountStore
  tokens: AccessTokens
  readSubscription(): Promise<boolean>
  settings: SettingsStore
  tell(changed: KnownChanged): void
  changed(): void
  reportFailure(code: CopyFailure, status?: number): void
  later?: (run: () => void, wait: number) => void
  now?: () => number
  random?: () => number
  newId?: () => string
}

const knownIn = (draft: Draft, item: string) =>
  draft.get(keyOf('knownWord', item))?.data?.known === true

const aboutKnown = (change: CopyChange) =>
  change.change === 'mark' || change.change === 'clear' || change.change === 'set'
    ? change.item
    : null

export type TellSender = (refusal: SavingRefusal) => void

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
    changed: parts.changed,
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
        knownWords: wordsIn(items, 'known'),
        learningWords: wordsIn(items, 'learning'),
        lists: listsOf(draft),
        notes: notesOf(items),
        accountSettings: accountSettingsOf(items),
        unsynced: studyChanges(draft.meta?.queue ?? []),
        lastSyncedAt: draft.meta?.lastSyncedAt ?? null,
        sync: signedIn ? sync.state() : 'signed-out'
      }
    })
  }

  async function signedIn(user: User): Promise<void> {
    if (!(await copy.edit(draft => ownedBy(draft, user)))) return
    parts.tell({ target: 'known', known: null })
    parts.changed()
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

  async function saver(): Promise<User | SavingRefusal> {
    const kept = await parts.store.keptAccount()
    if ((await parts.store.sessionToken()) === null || kept === null) return 'signed-out'
    return kept.subscription?.cloudAccess === 'subscription_required'
      ? 'subscription-required'
      : kept.user
  }

  async function refusal(): Promise<SavingRefusal | null> {
    const user = await saver()
    return typeof user === 'string' ? user : null
  }

  function syncAfter(tellSender?: TellSender) {
    const before = sync.state()
    void sync.chance('change').then(() => {
      if (before !== 'subscription-required' && sync.state() === 'subscription-required') {
        tellSender?.('subscription-required')
      }
    })
  }

  async function change(
    raw: unknown,
    tellSender?: TellSender,
    about?: string
  ): Promise<CopyAnswer> {
    const asked = changeOf(raw)
    if (asked === null) return { type: 'refused', refusal: 'invalid' }
    const word = aboutKnown(asked)
    const outcome = await copy.edit(async draft => {
      const user = await saver()
      if (typeof user === 'string') return user
      if (ownedBy(draft, user)) parts.tell({ target: 'known', known: null })
      if (about !== undefined && !aboutOnly(draft, asked, about)) return 'invalid' as const
      const was = word !== null && knownIn(draft, word)
      if (!applyChange(draft, asked, clock)) return 'invalid' as const
      return word !== null && knownIn(draft, word) !== was ? { [word]: !was } : null
    })
    if (typeof outcome === 'string') return { type: 'refused', refusal: outcome }
    if (outcome) parts.tell({ target: 'known', known: outcome })
    parts.changed()
    syncAfter(tellSender)
    return { type: 'changed' }
  }

  const word = async (item: string): Promise<WordView> => {
    const refused = await refusal()
    const view = await copy.look(draft => wordViewOf(draft, item))
    return { ...view, refusal: refused }
  }

  const known = (items: string[]) =>
    copy.look(draft =>
      Object.fromEntries(items.slice(0, knownAtOnce).map(item => [item, knownIn(draft, item)]))
    )

  async function answer(request: CopyRequest, tellSender?: TellSender): Promise<CopyAnswer> {
    switch (request.copy) {
      case 'read':
        return { type: 'copy', copy: await view() }
      case 'change':
        return change(request.change, tellSender)
      case 'word':
        return { type: 'word', word: await word(request.item) }
      case 'word-change':
        return change(request.change, tellSender, request.item)
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
    parts.changed()
  }

  const chance = (reason: Reason) => void sync.chance(reason)

  return { answer, signedIn, settingsChanged, forget, chance, refusal }
}

export type AccountCopy = ReturnType<typeof accountCopy>
