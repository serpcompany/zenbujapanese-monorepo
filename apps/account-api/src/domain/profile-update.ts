import { editedProfile, isRejection, type Profile, type Rejection, rejection } from './profile'
import type { LockedAccount } from './store'

export type ProfileUpdate =
  | { status: 'updated' | 'unchanged'; profile: Profile }
  | { status: 'conflict'; profile: Profile }
  | { status: 'rejected'; rejection: Rejection }

export const usernameTaken = rejection('username_taken', 'That username is taken. Choose another.')

export async function updateProfile(
  account: LockedAccount,
  baseVersion: number,
  fields: Record<string, unknown>
): Promise<ProfileUpdate> {
  const current = account.profile
  if (baseVersion !== current.version) return { status: 'conflict', profile: current }
  const next = editedProfile(current, fields)
  if (isRejection(next)) return { status: 'rejected', rejection: next }
  if (next.name === current.name && next.username === current.username) {
    return { status: 'unchanged', profile: current }
  }
  const saved = await account.saveProfile(next, current.version + 1)
  if (saved === 'username_taken') return { status: 'rejected', rejection: usernameTaken }
  await account.journal({
    entityType: 'profile',
    entityId: saved.id,
    entityVersion: saved.version,
    operation: 'update'
  })
  return { status: 'updated', profile: saved }
}
