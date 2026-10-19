import {
  applied,
  type Change,
  type ClientMutation,
  conflict,
  type Entity,
  gone,
  journaled,
  needsBaseVersion,
  type Outcome,
  rejected,
  type SyncContext,
  sha256IdOf
} from './entities'
import type { ProfilePhoto } from './kept-store'
import { notUploaded } from './photos'
import { rejection } from './profile'
import type { LockedAccount } from './store'

const notTheAccount = rejection(
  'invalid_mutation',
  "A profile photo's entityId is the signed-in account's ID, or left out."
)
const badFields = rejection(
  'invalid_fields',
  "A profile photo's `set` has photoId, the SHA-256 of an uploaded file, in 64 lowercase hex digits. Nothing else."
)

async function usable(account: LockedAccount, photoId: string, context: SyncContext) {
  const file = await account.photoFile(photoId)
  return file !== null && (context.granted.has('photos:read') || file.profileUploadAt !== null)
}

const asChange = (accountId: string, photo: ProfilePhoto | null): Change =>
  photo?.photoId
    ? {
        entity: 'profilePhoto',
        entityId: accountId,
        operation: 'put',
        version: photo.version,
        data: { photoId: photo.photoId }
      }
    : gone('profilePhoto', accountId, photo?.version ?? 0)

async function change(
  account: LockedAccount,
  mutation: ClientMutation,
  photoId: string | null,
  context: SyncContext
): Promise<Outcome> {
  if (mutation.entityId !== undefined && mutation.entityId !== account.profile.id) {
    return rejected(notTheAccount)
  }
  if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
  const current = await account.profilePhoto()
  const version = current?.version ?? 0
  if ((current?.photoId ?? null) === photoId) return applied(version)
  if (mutation.baseVersion !== version) return conflict(asChange(account.profile.id, current))
  if (photoId && !(await usable(account, photoId, context))) return rejected(notUploaded)
  await account.saveProfilePhoto({ photoId, version: version + 1 })
  if (current?.photoId) await account.releasePhotoFile(current.photoId)
  return journaled(
    account,
    'profilePhoto',
    account.profile.id,
    version + 1,
    photoId ? 'set' : 'remove'
  )
}

export const profilePhotos: Entity = {
  reads: 'profile',
  operations: {
    set: {
      needs: ['profile'],
      apply: async (account, mutation, context) => {
        const fields = mutation.fields ?? {}
        const photoId = sha256IdOf(typeof fields.photoId === 'string' ? fields.photoId : undefined)
        if (!photoId || Object.keys(fields).length !== 1) return rejected(badFields)
        return change(account, mutation, photoId, context)
      }
    },
    remove: {
      needs: ['profile'],
      apply: (account, mutation, context) => change(account, mutation, null, context)
    }
  },
  async current(reader, entityId) {
    return asChange(entityId, await reader.profilePhoto())
  }
}
