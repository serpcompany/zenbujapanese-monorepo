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
  deletionsPerSweep: 100
} as const

export interface PhotoStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<Uint8Array<ArrayBuffer> | null>
  delete(key: string): Promise<void>
}

type Refused<S extends string> = S extends string ? { status: S } : never

type Upload =
  | { status: 'stored' | 'kept'; file: PhotoFile }
  | Refused<'digest_mismatch' | 'unsupported' | 'too_many' | 'no_account' | 'unavailable'>

type Download =
  | { status: 'found'; file: PhotoFile; bytes: Uint8Array<ArrayBuffer> }
  | Refused<'missing' | 'no_account' | 'unavailable'>

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
  photoId: string
): Promise<Upload | { status: 'room' }> {
  const existing = await account.photoFile(photoId)
  if (existing) return { status: 'kept', file: existing }
  if ((await account.photoFileCount()) >= photoLimits.photos) return { status: 'too_many' }
  return { status: 'room' }
}

export function photoFiles(store: AccountStore, storage: PhotoStorage | null) {
  let sweeping: Promise<number> | null = null

  async function sweepOnce() {
    let deleted = 0
    for (;;) {
      const due = storage ? await store.photoDeletions.due(photoLimits.deletionsPerSweep) : []
      for (const key of due) {
        await storage?.delete(key)
        await store.photoDeletions.done(key)
      }
      deleted += due.length
      if (due.length < photoLimits.deletionsPerSweep) return deleted
    }
  }

  async function keep(
    userId: string,
    photoId: string,
    bytes: Uint8Array,
    contentType: string
  ): Promise<Upload> {
    const storageKey = `${userId}/${randomUUID()}`
    const before = await store.withLockedAccount(userId, async account => {
      const ready = await roomFor(account, photoId)
      if (ready.status === 'room') {
        await account.holdPhotoDeletion(storageKey, photoLimits.uploadHeldHours)
      }
      return ready
    })
    if (!before) return { status: 'no_account' }
    if (before.status !== 'room') return before
    await storage?.put(storageKey, bytes, contentType)
    const after = await store.withLockedAccount(userId, async account => {
      const ready = await roomFor(account, photoId)
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
    async upload(userId: string, photoId: string, bytes: Uint8Array): Promise<Upload> {
      if (!storage) return { status: 'unavailable' }
      if (sha256Of(bytes) !== photoId) return { status: 'digest_mismatch' }
      const contentType = imageTypeOf(bytes)
      if (!contentType) return { status: 'unsupported' }
      return keep(userId, photoId, bytes, contentType)
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
      const bytes = await storage.get(file.storageKey)
      return bytes ? { status: 'found', file, bytes } : { status: 'missing' }
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
