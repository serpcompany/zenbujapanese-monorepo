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

export function refusalOf(value: unknown, status: number): Refusal {
  const error = isFields(value) && isFields(value.error) ? value.error : {}
  return {
    code: textIn(error, 'code') ?? `status_${status}`,
    message: textIn(error, 'message') ?? '',
    current: isFields(value) ? profileOf(value.current) : null
  }
}
