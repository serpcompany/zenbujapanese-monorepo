import {
  accountName,
  accountUsername,
  nameRule,
  profileLimits,
  usernameRule
} from '@zenbu/account-rules/profile'

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
  | 'too_many_bookmarks'
  | 'too_many_notes'
  | 'unknown_photo'
  | 'photo_not_uploaded'
  | 'photo_full'
  | 'unknown_setting'
  | 'not_allowed'

export { profileLimits }

export const rejection = (code: RejectionCode, message: string): Rejection => ({ code, message })

export const isRejection = (value: unknown): value is Rejection =>
  typeof value === 'object' && value !== null && 'code' in value && 'message' in value

export function normalizeName(raw: unknown): string | Rejection {
  if (typeof raw !== 'string') return rejection('invalid_fields', 'A name must be text.')
  return accountName(raw) ?? rejection('invalid_fields', nameRule)
}

export function normalizeUsername(raw: unknown): string | null | Rejection {
  if (raw === null) return null
  if (typeof raw !== 'string')
    return rejection('invalid_fields', 'A username must be text, or null to remove it.')
  return accountUsername(raw) ?? rejection('invalid_fields', usernameRule)
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
