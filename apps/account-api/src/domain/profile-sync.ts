import { applied, type Change, conflict, type Entity, needsBaseVersion, rejected } from './entities'
import { type Profile, rejection } from './profile'
import { updateProfile } from './profile-update'

const notTheAccount = rejection(
  'invalid_mutation',
  "A profile's entityId is the signed-in account's ID, or left out."
)

const asChange = (profile: Profile): Change => ({
  entity: 'profile',
  entityId: profile.id,
  operation: 'put',
  version: profile.version,
  data: profile
})

export const profiles: Entity = {
  reads: 'profile',
  operations: {
    update: {
      needs: ['profile'],
      async apply(account, mutation) {
        if (mutation.entityId !== undefined && mutation.entityId !== account.profile.id) {
          return rejected(notTheAccount)
        }
        if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
        const update = await updateProfile(account, mutation.baseVersion, mutation.fields ?? {})
        if (update.status === 'conflict') return conflict(asChange(update.profile))
        if (update.status === 'rejected') return rejected(update.rejection)
        return applied(update.profile.version)
      }
    }
  },
  async current(reader) {
    const profile = await reader.currentProfile()
    return profile && asChange(profile)
  }
}
