import { AccountCopy } from '@zenbu/account-rules/account-copy'
import type { AccessTokens } from './access-tokens'
import type { AccountSession } from './answers'
import type { AccountApi, Failure } from './client'
import { isSignedOut } from './messages'
import { accountPages } from './pages'

export type SyncedCopy = AccountCopy<Failure>

export interface KindRead {
  kind: string
  item?: string
}

export type LoadedSynced =
  | { kind: 'shown'; copy: SyncedCopy; session: AccountSession }
  | { kind: 'signed-out' }
  | { kind: 'subscription-required' }
  | { kind: 'failed'; failure: Failure }

export const syncedAreas = {
  knownWords: [{ kind: 'knownWord' }],
  lists: [{ kind: 'list' }, { kind: 'listWord' }, { kind: 'knownWord' }],
  notes: [{ kind: 'wordNote' }],
  mediaLibrary: [{ kind: 'photo' }, { kind: 'photoWord' }],
  recentVideos: [{ kind: 'watchedVideo' }],
  bookmarks: [{ kind: 'bookmarkedSentence' }],
  recentSearches: [{ kind: 'recentSearch' }],
  settings: [{ kind: 'setting' }]
} as const satisfies Record<string, readonly KindRead[]>

export type SyncedArea = keyof typeof syncedAreas

export const syncedAreaNames = Object.keys(syncedAreas) as SyncedArea[]

export function syncedAreaAt(segment: string): SyncedArea | null {
  const path = `/account/${segment}/`
  return syncedAreaNames.find(area => accountPages[area].path === path) ?? null
}

export const needsASubscription = (failure: Failure) =>
  failure.kind === 'refused' && failure.status === 402

export function syncedCopy(
  api: AccountApi,
  tokens: AccessTokens,
  newId: () => string = () => crypto.randomUUID()
): SyncedCopy {
  return new AccountCopy<Failure>(
    {
      readKind: (entity, query) => tokens.use(token => api.readKind(token, entity, query)),
      sync: mutations => tokens.use(token => api.sync(token, mutations)),
      isStaleCursor: failure => failure.kind === 'refused' && failure.status === 410
    },
    newId
  )
}

export function notShown(failure: Failure): LoadedSynced {
  if (isSignedOut(failure)) return { kind: 'signed-out' }
  if (needsASubscription(failure)) return { kind: 'subscription-required' }
  return { kind: 'failed', failure }
}

export async function loadSynced(
  api: AccountApi,
  tokens: AccessTokens,
  reads: readonly KindRead[]
): Promise<LoadedSynced> {
  const session = await api.session()
  if (!session.ok) return notShown(session.failure)
  if (session.value === null) return { kind: 'signed-out' }
  tokens.belongTo(session.value.userId)
  const copy = syncedCopy(api, tokens)
  const answers = await Promise.all(reads.map(({ kind, item }) => copy.read(kind, item)))
  for (const answer of answers) if (!answer.ok) return notShown(answer.failure)
  return { kind: 'shown', copy, session: session.value }
}
