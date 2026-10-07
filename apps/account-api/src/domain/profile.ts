export interface Profile {
  id: string
  name: string
  username: string | null
  email: string
  version: number
  createdAt: Date
  updatedAt: Date
}

export interface EditableProfile {
  name: string
  username: string | null
}

export interface Rejection {
  code: RejectionCode
  message: string
}

export type RejectionCode =
  | 'invalid_fields'
  | 'username_taken'
  | 'unknown_entity'
  | 'unknown_operation'
  | 'invalid_mutation'
  | 'mutation_id_reused'
  | 'already_exists'
  | 'unknown_list'
  | 'too_many_lists'
  | 'list_full'
  | 'not_allowed'

export const profileLimits = { nameLength: 100, usernameLength: { min: 3, max: 30 } } as const

const { min, max } = profileLimits.usernameLength
const usernamePattern = new RegExp(`^[a-z0-9_]{${min},${max}}$`)
const controlCharacters = /\p{Cc}|\p{Cf}|\p{Cs}/u

export const rejection = (code: RejectionCode, message: string): Rejection => ({ code, message })

export const isRejection = (value: unknown): value is Rejection =>
  typeof value === 'object' && value !== null && 'code' in value && 'message' in value

export function normalizeName(raw: unknown): string | Rejection {
  if (typeof raw !== 'string') return rejection('invalid_fields', 'name must be a string.')
  const name = raw.normalize('NFC').trim().replace(/\s+/gu, ' ')
  const length = [...name].length
  if (length === 0 || length > profileLimits.nameLength || controlCharacters.test(name)) {
    return rejection(
      'invalid_fields',
      `name must be 1 to ${profileLimits.nameLength} characters, with no control characters.`
    )
  }
  return name
}

export function normalizeUsername(raw: unknown): string | null | Rejection {
  if (raw === null) return null
  if (typeof raw !== 'string')
    return rejection('invalid_fields', 'username must be a string or null.')
  const username = raw.normalize('NFKC').trim().toLowerCase()
  if (!usernamePattern.test(username)) {
    return rejection(
      'invalid_fields',
      `username must be ${min} to ${max} letters a to z, digits, or underscores.`
    )
  }
  return username
}

const editable = new Set(['name', 'username'])

export function editedProfile(
  current: EditableProfile,
  fields: Record<string, unknown>
): EditableProfile | Rejection {
  const unknown = Object.keys(fields).filter(field => !editable.has(field))
  if (unknown.length > 0) {
    return rejection(
      'invalid_fields',
      `Only name and username can change, not ${unknown.join(', ')}.`
    )
  }
  if (Object.keys(fields).length === 0) {
    return rejection('invalid_fields', 'Send name, username, or both.')
  }
  const name = 'name' in fields ? normalizeName(fields.name) : current.name
  if (isRejection(name)) return name
  const username = 'username' in fields ? normalizeUsername(fields.username) : current.username
  if (isRejection(username)) return username
  return { name, username }
}
