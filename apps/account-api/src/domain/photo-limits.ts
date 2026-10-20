export const photoLimits = {
  bytes: 12 * 1024 * 1024,
  photos: 1_000,
  wordsPerPhoto: 500,
  removedWordsPerPhoto: 500,
  nameLength: 200,
  uploadHeldHours: 24,
  deletionsPerSweep: 100,
  deletionRetryHours: 1,
  goneKept: 1_000,
  profileUploads: 2,
  emptiedKeptDays: 30
} as const
