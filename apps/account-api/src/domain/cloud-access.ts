export interface CloudAccessRules {
  needsSubscription: boolean
  freeForAccountsMadeBefore: Date | null
  freeUntil: Date | null
  freeClients: readonly string[]
}

export const cloudIsFree: CloudAccessRules = {
  needsSubscription: false,
  freeForAccountsMadeBefore: null,
  freeUntil: null,
  freeClients: []
}

export type CloudAccess = 'subscribed' | 'free' | 'subscription_required'

export interface CloudAccount {
  clientId: string
  madeAt: Date
  subscribed: boolean
}

export function cloudAccess(
  rules: CloudAccessRules,
  account: CloudAccount,
  now: Date
): CloudAccess {
  if (account.subscribed) return 'subscribed'
  const { needsSubscription, freeClients, freeUntil, freeForAccountsMadeBefore } = rules
  const free =
    !needsSubscription ||
    freeClients.includes(account.clientId) ||
    (freeUntil !== null && now < freeUntil) ||
    (freeForAccountsMadeBefore !== null && account.madeAt < freeForAccountsMadeBefore)
  return free ? 'free' : 'subscription_required'
}
