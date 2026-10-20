import { afterEach, describe, expect, test, vi } from 'vitest'
import { logged } from '../test/logged'
import { standInStripe, stripeSettings } from '../test/stripe'
import { stripeBilling } from './stripe'

afterEach(() => {
  vi.restoreAllMocks()
})

const priceReads = (stripe: ReturnType<typeof standInStripe>) =>
  stripe.requests.filter(each => each.path.startsWith('/v1/prices/')).length

describe("the website's plans, as Stripe describes them", () => {
  test('reads each price from Stripe once in five minutes, however many account pages ask', async () => {
    const stripe = standInStripe()
    const billing = stripeBilling(stripeSettings, { fetch: stripe.fetch, retries: 0 })
    const first = await billing.describePrices()
    expect(await billing.describePrices()).toEqual(first)
    expect(priceReads(stripe)).toBe(stripeSettings.prices.length)
  })

  test("leaves out a price it can't offer, and logs which and why, while offering the rest", async () => {
    const stripe = standInStripe()
    const prices = ['price_monthly', 'price_metered', 'price_missing']
    const billing = stripeBilling(
      { ...stripeSettings, prices },
      { fetch: stripe.fetch, retries: 0, plansKeptForMs: 0 }
    )
    const output = logged()
    expect((await billing.describePrices()).map(plan => plan.price)).toEqual(['price_monthly'])
    expect(output()).toContain('"price":"price_metered"')
    expect(output()).toContain('"price":"price_missing"')
    expect(output()).toContain('has no fixed recurring amount')
  })
})
