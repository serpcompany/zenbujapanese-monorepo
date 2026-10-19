import { describe, expect, test } from 'vitest'
import type { Learner } from '../test/accounts'
import { standInAppStore } from '../test/app-store'
import { useBillingService } from '../test/billing'

const billing = useBillingService({ appStore: standInAppStore() })

const dayMs = 24 * 60 * 60 * 1000

const remove = (learner: Learner) => billing.deleteAccount(learner)

async function websiteSubscriber(email: string, expiresAt: Date) {
  const learner = await billing.accounts.learner(email)
  await billing.holds(learner, { source: 'stripe', expiresAt })
  return learner
}

describe('DELETE /v1/me, after Stripe was turned off', () => {
  test('deletes an account whose website subscription has lapsed past its paid time', async () => {
    const learner = await websiteSubscriber(
      'off-lapsed@example.com',
      new Date(Date.now() - 3 * dayMs)
    )
    expect((await remove(learner)).status).toBe(200)
  })

  test("deletes nothing while a website subscription may still bill, since it can't be canceled", async () => {
    const learner = await websiteSubscriber(
      'off-running@example.com',
      new Date(Date.now() + 10 * dayMs)
    )
    await billing.expectNothingDeleted(learner, await remove(learner))
  })
})
