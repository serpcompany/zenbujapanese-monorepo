const appStoreEnvironments = ['Production', 'Sandbox', 'Xcode'] as const
export type AppStoreEnvironment = (typeof appStoreEnvironments)[number]

export interface StripeSettings {
  secretKey: string
  webhookSecret: string
  prices: readonly string[]
  trialDays: number | null
  gracePeriodDays: number
}

export interface AppStoreSettings {
  appAppleId: number | undefined
  environments: readonly AppStoreEnvironment[]
  products: readonly string[]
}

export interface CloudSettings {
  needsSubscription: boolean
  freeForAccountsMadeBefore: Date | null
  freeUntil: Date | null
  freeClients: readonly string[]
}

export interface BillingConfig {
  stripe: StripeSettings | null
  appStore: AppStoreSettings | null
  cloud: CloudSettings
}

const longestStripeTrialDays = 730
const longestGracePeriodDays = 60

const listIn = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

const valueIn = (env: NodeJS.ProcessEnv, name: string) => env[name]?.trim() ?? ''

function timeIn(env: NodeJS.ProcessEnv, name: string): Date | null {
  const value = valueIn(env, name)
  if (value === '') return null
  const time = new Date(value)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(time.getTime())) {
    throw new Error(`${name} must be an ISO 8601 time, such as 2027-01-01T00:00:00Z`)
  }
  return time
}

function daysIn(env: NodeJS.ProcessEnv, name: string, most: number): number | null {
  const value = valueIn(env, name)
  if (value === '') return null
  const days = Number(value)
  if (!Number.isInteger(days) || days < 0 || days > most) {
    throw new Error(`${name} must be a whole number of days from 0 to ${most}`)
  }
  return days
}

function readCloud(env: NodeJS.ProcessEnv): CloudSettings {
  const access = valueIn(env, 'ACCOUNT_API_CLOUD_ACCESS') || 'free'
  if (access !== 'free' && access !== 'subscription') {
    throw new Error(`ACCOUNT_API_CLOUD_ACCESS is ${access}; it can be free or subscription`)
  }
  return {
    needsSubscription: access === 'subscription',
    freeForAccountsMadeBefore: timeIn(env, 'ACCOUNT_API_CLOUD_FREE_FOR_ACCOUNTS_BEFORE'),
    freeUntil: timeIn(env, 'ACCOUNT_API_CLOUD_FREE_UNTIL'),
    freeClients: listIn(env.ACCOUNT_API_CLOUD_FREE_APPS)
  }
}

const stripeNames = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_IDS'] as const

function readStripe(env: NodeJS.ProcessEnv, local: boolean): StripeSettings | null {
  const [secretKey = '', webhookSecret = '', prices = ''] = stripeNames.map(name =>
    valueIn(env, name)
  )
  if (secretKey === '' && webhookSecret === '' && prices === '') return null
  const priceIds = listIn(prices)
  if (!/^(sk|rk)_(test|live)_./.test(secretKey)) {
    throw new Error('STRIPE_SECRET_KEY must be a Stripe secret or restricted key (sk_ or rk_)')
  }
  if (!webhookSecret.startsWith('whsec_')) {
    throw new Error("STRIPE_WEBHOOK_SECRET must be the webhook endpoint's signing secret (whsec_)")
  }
  if (priceIds.length === 0 || priceIds.some(id => !id.startsWith('price_'))) {
    throw new Error('STRIPE_PRICE_IDS must list the Stripe price IDs (price_) a subscription is')
  }
  if (local && /^(sk|rk)_live_/.test(secretKey)) {
    throw new Error('A live Stripe key never runs at localhost: use a test-mode key')
  }
  return {
    secretKey,
    webhookSecret,
    prices: priceIds,
    trialDays: daysIn(env, 'STRIPE_TRIAL_DAYS', longestStripeTrialDays) || null,
    gracePeriodDays: daysIn(env, 'STRIPE_GRACE_PERIOD_DAYS', longestGracePeriodDays) ?? 0
  }
}

const isAppStoreEnvironment = (value: string): value is AppStoreEnvironment =>
  (appStoreEnvironments as readonly string[]).includes(value)

function readAppStore(env: NodeJS.ProcessEnv, local: boolean): AppStoreSettings | null {
  const products = listIn(env.APP_STORE_PRODUCT_IDS)
  if (products.length === 0) return null
  const environments = listIn(env.APP_STORE_ENVIRONMENTS)
  if (environments.length === 0 || !environments.every(isAppStoreEnvironment)) {
    throw new Error(
      'APP_STORE_ENVIRONMENTS must name the App Store environments to take: Production, Sandbox, or, at localhost, Xcode'
    )
  }
  if (!local && environments.includes('Xcode')) {
    throw new Error(
      "APP_STORE_ENVIRONMENTS can name Xcode only at localhost: Xcode's purchases aren't signed by Apple"
    )
  }
  const appleId = valueIn(env, 'APP_STORE_APP_APPLE_ID')
  if (environments.includes('Production') && !/^\d+$/.test(appleId)) {
    throw new Error(
      "APP_STORE_APP_APPLE_ID must be the app's Apple ID, a number, to take Production purchases"
    )
  }
  return {
    appAppleId: appleId === '' ? undefined : Number(appleId),
    environments,
    products
  }
}

export function readBilling(env: NodeJS.ProcessEnv, local: boolean): BillingConfig {
  const billing = {
    stripe: readStripe(env, local),
    appStore: readAppStore(env, local),
    cloud: readCloud(env)
  }
  if (billing.cloud.needsSubscription && !billing.stripe && !billing.appStore) {
    throw new Error(
      'ACCOUNT_API_CLOUD_ACCESS=subscription needs a way to subscribe: set up Stripe or the App Store first'
    )
  }
  return billing
}
