import { createHash, randomUUID } from 'node:crypto'
import type { Scope } from './clients'
import type { PhotoFile } from './kept-store'
import type { AccountStore, LockedAccount } from './store'

export const photoLimits = {
  bytes: 12 * 1024 * 1024,
  photos: 1_000,
  wordsPerPhoto: 500,
  nameLength: 200,
  uploadHeldHours: 24,
  deletionsPerSweep: 100,
  goneKept: 1_000,
  outsideTheLibrary: 2,
  emptiedKeptDays: 30
} as const

interface StoredPhoto {
  body: ReadableStream<Uint8Array>
  size: number | null
}

export interface PhotoStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<StoredPhoto | null>
  has(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  deleteUnder(prefix: string): Promise<void>
}

export const accountFolder = (userId: string) => `${userId}/`

type Refused<S extends string> = S extends string ? { status: S } : never

type Upload =
  | { status: 'stored' | 'kept'; file: PhotoFile }
  | Refused<'digest_mismatch' | 'unsupported' | 'too_many' | 'no_account' | 'unavailable'>

type Download =
  | { status: 'found'; file: PhotoFile; photo: StoredPhoto }
  | Refused<'missing' | 'file_missing' | 'no_account' | 'unavailable'>

const startsWith = (bytes: Uint8Array, at: number, ascii: string) =>
  [...ascii].every((letter, index) => bytes[at + index] === letter.charCodeAt(0))

const isoBrands: readonly [string, readonly string[]][] = [
  ['image/heic', ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']],
  ['image/heif', ['mif1', 'msf1']],
  ['image/avif', ['avif', 'avis']]
]

export function imageTypeOf(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && startsWith(bytes, 1, 'PNG\r\n\u001a\n')) return 'image/png'
  if (startsWith(bytes, 0, 'GIF87a') || startsWith(bytes, 0, 'GIF89a')) return 'image/gif'
  if (startsWith(bytes, 0, 'RIFF') && startsWith(bytes, 8, 'WEBP')) return 'image/webp'
  if (startsWith(bytes, 0, 'II*\u0000') || startsWith(bytes, 0, 'MM\u0000*')) return 'image/tiff'
  if (startsWith(bytes, 0, 'BM')) return 'image/bmp'
  if (!startsWith(bytes, 4, 'ftyp')) return null
  const brand = String.fromCharCode(...bytes.slice(8, 12))
  return isoBrands.find(([, brands]) => brands.includes(brand))?.[0] ?? null
}

const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function roomFor(
  account: LockedAccount,
  photoId: string,
  library: boolean
): Promise<Upload | { status: 'room' }> {
  const existing = await account.photoFile(photoId)
  if (existing) return { status: 'kept', file: existing }
  if ((await account.photoFileCount()) >= photoLimits.photos) return { status: 'too_many' }
  if (!library && (await account.filesOutsideTheLibrary()) >= photoLimits.outsideTheLibrary) {
    return { status: 'too_many' }
  }
  return { status: 'room' }
}

export function photoFiles(store: AccountStore, storage: PhotoStorage | null) {
  let sweeping: Promise<number> | null = null

  async function sweepOnce() {
    let deleted = 0
    for (;;) {
      const due = storage ? await store.photoDeletions.due(photoLimits.deletionsPerSweep) : []
      for (const key of due) {
        await (key.endsWith('/') ? storage?.deleteUnder(key) : storage?.delete(key))
        await store.photoDeletions.done(key)
      }
      deleted += due.length
      if (due.length < photoLimits.deletionsPerSweep) return deleted
    }
  }

  async function restored(file: PhotoFile, bytes: Uint8Array): Promise<Upload> {
    if (!(await storage?.has(file.storageKey))) {
      await storage?.put(file.storageKey, bytes, file.contentType)
    }
    return { status: 'kept', file }
  }

  async function keep(
    userId: string,
    photoId: string,
    bytes: Uint8Array,
    contentType: string,
    library: boolean
  ): Promise<Upload> {
    const storageKey = `${accountFolder(userId)}${randomUUID()}`
    const before = await store.withLockedAccount(userId, async account => {
      const ready = await roomFor(account, photoId, library)
      if (ready.status === 'room') {
        await account.holdPhotoDeletion(storageKey, photoLimits.uploadHeldHours)
      }
      return ready
    })
    if (!before) return { status: 'no_account' }
    if (before.status === 'kept') return restored(before.file, bytes)
    if (before.status !== 'room') return before
    await storage?.put(storageKey, bytes, contentType)
    const after = await store.withLockedAccount(userId, async account => {
      const ready = await roomFor(account, photoId, library)
      if (ready.status !== 'room') return ready
      const file = { id: photoId, contentType, byteSize: bytes.byteLength, storageKey }
      const stored = await account.savePhotoFile(file)
      await account.cancelPhotoDeletion(storageKey)
      return { status: 'stored' as const, file: stored }
    })
    if (after?.status !== 'stored') await store.photoDeletions.dueAt(storageKey, 0)
    return after ?? { status: 'no_account' }
  }

  return {
    async upload(
      userId: string,
      photoId: string,
      bytes: Uint8Array,
      granted: ReadonlySet<Scope>
    ): Promise<Upload> {
      if (!storage) return { status: 'unavailable' }
      if (sha256Of(bytes) !== photoId) return { status: 'digest_mismatch' }
      const contentType = imageTypeOf(bytes)
      if (!contentType) return { status: 'unsupported' }
      const library = granted.has('photos:write')
      const upload = await keep(userId, photoId, bytes, contentType, library)
      return upload.status === 'kept' && !library
        ? { status: 'stored', file: { ...upload.file, uploadedAt: new Date() } }
        : upload
    },

    async download(
      userId: string,
      photoId: string,
      granted: ReadonlySet<Scope>
    ): Promise<Download> {
      if (!storage) return { status: 'unavailable' }
      const reader = store.reader(userId)
      const file = await reader.photoFile(photoId)
      const readable =
        granted.has('photos:read') ||
        (granted.has('profile') && (await reader.profilePhoto())?.photoId === photoId)
      if (!file && !(await store.profile(userId))) return { status: 'no_account' }
      if (!file || !readable) return { status: 'missing' }
      const photo = await storage.get(file.storageKey)
      return photo ? { status: 'found', file, photo } : { status: 'file_missing' }
    },

    sweep(): Promise<number> {
      sweeping ??= sweepOnce().finally(() => {
        sweeping = null
      })
      return sweeping
    }
  }
}

export type PhotoFiles = ReturnType<typeof photoFiles>
