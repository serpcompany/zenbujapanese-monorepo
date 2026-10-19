import type { BillingTransaction, DeviceTransaction } from './billing'
import { supersedes } from './subscriptions'

export type Claim = 'claimed' | 'another_account' | 'no_account'

export async function claimAppleTransaction(
  tx: BillingTransaction,
  userId: string,
  { state, ledger }: DeviceTransaction
): Promise<Claim> {
  if (!(await tx.accountExists(userId))) return 'no_account'
  const held = await tx.lockSubscription(state.subscription)
  const token = state.hints.appAccountToken
  const owner = (token ? await tx.accountByToken(token) : null) ?? held?.userId ?? null
  if (owner !== null && owner !== userId) return 'another_account'
  const newer = supersedes(state.subscription, held)
  if (held?.userId && held.userId !== userId && !newer) return 'another_account'
  if (newer) await tx.saveSubscription(userId, state.subscription)
  else if (held !== null && held.userId !== userId)
    await tx.assignSubscription(state.subscription, userId)
  for (const entry of ledger) await tx.record(entry, userId)
  return 'claimed'
}
