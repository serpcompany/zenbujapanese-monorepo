type Fields = Record<string, unknown>

export const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function jwtClaims(token: string): Fields | null {
  try {
    const payload = token.split('.')[1] ?? ''
    const claims: unknown = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/')))
    return isFields(claims) ? claims : null
  } catch {
    return null
  }
}

const textIn = (fields: Fields, key: string) =>
  typeof fields[key] === 'string' ? (fields[key] as string) : null

export interface Profile {
  id: string
  name: string
  username: string | null
  email: string
  version: number
  createdAt: string
}

export interface AccountSession {
  userId: string
  email: string
  signedInAt: number
  token: string
}

export type Provider = 'apple' | 'google' | 'email'

export interface Identity {
  id: string
  provider: Provider
  subject: string
}

export interface Refusal {
  code: string
  message: string
  current: Profile | null
}

export function profileOf(value: unknown): Profile | null {
  if (!isFields(value)) return null
  const id = textIn(value, 'id')
  const name = textIn(value, 'name')
  const email = textIn(value, 'email')
  const createdAt = textIn(value, 'createdAt')
  const username = value.username === null ? null : textIn(value, 'username')
  const version = value.version
  if (id === null || name === null || email === null) return null
  if (createdAt === null || Number.isNaN(Date.parse(createdAt))) return null
  if (username === null && value.username !== null) return null
  if (typeof version !== 'number' || !Number.isInteger(version)) return null
  return { id, name, username, email, version, createdAt }
}

export function sessionOf(value: unknown): AccountSession | null | undefined {
  if (value === null) return null
  if (!isFields(value) || !isFields(value.user) || !isFields(value.session)) return undefined
  const userId = textIn(value.user, 'id')
  const email = textIn(value.user, 'email')
  const token = textIn(value.session, 'token')
  const signedInAt = Date.parse(textIn(value.session, 'createdAt') ?? '')
  if (userId === null || email === null || token === null || Number.isNaN(signedInAt)) {
    return undefined
  }
  return { userId, email, signedInAt, token }
}

const providers: readonly Provider[] = ['apple', 'google', 'email']

export function identitiesOf(value: unknown): Identity[] | null {
  if (!Array.isArray(value)) return null
  const identities = value.flatMap(item => {
    if (!isFields(item)) return []
    const id = textIn(item, 'id')
    const provider = providers.find(each => each === item.providerId)
    const subject = textIn(item, 'accountId')
    return id !== null && provider !== undefined && subject !== null
      ? [{ id, provider, subject }]
      : []
  })
  return identities.length === value.length ? identities : null
}

export const signedInUserOf = (value: unknown) =>
  isFields(value) && isFields(value.user) ? textIn(value.user, 'id') : null

export const textAnswer = (value: unknown, key: string) =>
  isFields(value) ? textIn(value, key) : null

export const trueAnswer = (value: unknown, key: string) => isFields(value) && value[key] === true

export type ManagedIn = 'app_store' | 'website'

const subscriptionStatuses = [
  'active',
  'grace_period',
  'billing_retry',
  'pending',
  'paused',
  'expired',
  'revoked'
] as const

export type SubscriptionStatus = (typeof subscriptionStatuses)[number]

export interface HeldSubscription {
  status: SubscriptionStatus
  expiresAt: string | null
  willRenew: boolean | null
  managedIn: ManagedIn | null
}

export interface Subscription {
  latest: HeldSubscription | null
  running: HeldSubscription[]
  canSubscribe: boolean
  websitePrices: string[]
  appStoreProducts: string[]
}

const managedInOf = (value: unknown): ManagedIn | null =>
  value === 'app_store' || value === 'website' ? value : null

const textsIn = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

function heldOf(value: unknown, managed: boolean): HeldSubscription | null {
  if (!isFields(value)) return null
  const status = subscriptionStatuses.find(each => each === value.status)
  const managedIn = managedInOf(value.managedIn)
  if (status === undefined || (managed && managedIn === null)) return null
  return {
    status,
    expiresAt: textIn(value, 'expiresAt'),
    willRenew: typeof value.willRenew === 'boolean' ? value.willRenew : null,
    managedIn
  }
}

export function subscriptionOf(value: unknown): Subscription | null {
  if (!isFields(value) || typeof value.canSubscribe !== 'boolean') return null
  const offers = isFields(value.offers) ? value.offers : {}
  const running = Array.isArray(value.running) ? value.running.map(item => heldOf(item, true)) : []
  return {
    latest: heldOf(value, false),
    running: running.filter((held): held is HeldSubscription => held !== null),
    canSubscribe: value.canSubscribe,
    websitePrices: textsIn(offers.website),
    appStoreProducts: textsIn(offers.appStore)
  }
}

export interface Plan {
  price: string
  name: string
  amount: number
  currency: string
  interval: 'day' | 'week' | 'month' | 'year'
  intervalCount: number
}

export interface Plans {
  plans: Plan[]
  trialDays: number | null
}

const intervals = ['day', 'week', 'month', 'year'] as const

function planOf(value: unknown): Plan[] {
  if (!isFields(value)) return []
  const price = textIn(value, 'price')
  const name = textIn(value, 'name')
  const currency = textIn(value, 'currency')
  const interval = intervals.find(each => each === value.interval)
  const { amount, intervalCount } = value
  if (price === null || name === null || currency === null || interval === undefined) return []
  if (typeof amount !== 'number' || typeof intervalCount !== 'number') return []
  return [{ price, name, amount, currency, interval, intervalCount }]
}

export function plansOf(value: unknown): Plans | null {
  if (!isFields(value) || !Array.isArray(value.plans)) return null
  const plans = value.plans.flatMap(planOf)
  if (plans.length !== value.plans.length) return null
  return { plans, trialDays: typeof value.trialDays === 'number' ? value.trialDays : null }
}

export function refusalOf(value: unknown, status: number): Refusal {
  const error = isFields(value) && isFields(value.error) ? value.error : {}
  return {
    code: textIn(error, 'code') ?? `status_${status}`,
    message: textIn(error, 'message') ?? '',
    current: isFields(value) ? profileOf(value.current) : null
  }
}
