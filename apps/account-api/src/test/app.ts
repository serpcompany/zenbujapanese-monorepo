import type { AppOptions } from '../http/app'

const noPhotos = { status: 'unavailable' } as const

export const standIns: AppOptions = {
  release: 'abc123def456',
  databaseReady: async () => true,
  auth: {
    handler: () =>
      Promise.resolve(
        Response.json({ code: 'INVALID_OTP', message: 'Invalid OTP' }, { status: 400 })
      )
  },
  accounts: {
    profile: async () => null,
    updateProfile: async () => null,
    sync: async () => ({ status: 'no_account' })
  },
  deleteAccount: async () => 'no_account',
  photoFiles: {
    upload: async () => noPhotos,
    download: async () => noPhotos
  },
  verifyAccessToken: async () => null,
  allowedOrigins: [],
  devMailbox: null
}
