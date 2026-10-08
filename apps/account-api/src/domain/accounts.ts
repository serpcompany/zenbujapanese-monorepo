import type { Cursors } from './cursor'
import { updateProfile } from './profile-update'
import type { AccountStore } from './store'
import { syncer } from './sync'

export function createAccounts(store: AccountStore, cursors: Cursors) {
  return {
    profile: (userId: string) => store.profile(userId),
    updateProfile: (userId: string, baseVersion: number, fields: Record<string, unknown>) =>
      store.withLockedAccount(userId, account => updateProfile(account, baseVersion, fields)),
    sync: syncer(store, cursors)
  }
}

export type Accounts = ReturnType<typeof createAccounts>
