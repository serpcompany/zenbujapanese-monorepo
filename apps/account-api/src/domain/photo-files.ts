import { createHash, randomUUID } from 'node:crypto'
import type { Scope } from './clients'
import type { PhotoFile } from './kept-store'
import { photoLimits } from './photo-limits'
import { deletePhoto } from './photos'
import type { AccountStore, LockedAccount } from './store'

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

async function roomInTheLibrary(account: LockedAccount) {
  while ((await account.photoFileCount()) >= photoLimits.photos) {
    const emptied = await account.oldestEmptiedPhoto()
    if (!emptied) return false
    await deletePhoto(account, emptied)
  }
  return true
}

async function roomFor(
  account: LockedAccount,
  photoId: string,
  library: boolean
): Promise<Upload | { status: 'room' }> {
  const existing = await account.photoFile(photoId)
  if (!library) {
    const own = existing?.profileUploadAt != null
    if (!own && (await account.profileUploadCount()) >= photoLimits.profileUploads) {
      return { status: 'too_many' }
    }
    if (!existing) return { status: 'room' }
    await account.markProfileUpload(photoId)
    return { status: 'kept', file: existing }
  }
  if (existing) return { status: 'kept', file: existing }
  return (await roomInTheLibrary(account)) ? { status: 'room' } : { status: 'too_many' }
}

async function saved(
  account: LockedAccount,
  file: { id: string; contentType: string; byteSize: number; storageKey: string },
  replacing: string | null,
  library: boolean
): Promise<Upload> {
  const existing = await account.photoFile(file.id)
  if (replacing !== null && existing?.storageKey === replacing) {
    const moved = await account.movePhotoFile(file.id, file.storageKey)
    await account.cancelPhotoDeletion(file.storageKey)
    return { status: 'kept', file: moved }
  }
  const ready = await roomFor(account, file.id, library)
  if (ready.status !== 'room') return ready
  const stored = await account.savePhotoFile(file, !library)
  await account.cancelPhotoDeletion(file.storageKey)
  return { status: 'stored', file: stored }
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

  async function keep(
    userId: string,
    photoId: string,
    bytes: Uint8Array,
    contentType: string,
    library: boolean
  ): Promise<Upload> {
    const before = await store.withLockedAccount(userId, account =>
      roomFor(account, photoId, library)
    )
    if (!before) return { status: 'no_account' }
    if (before.status !== 'kept' && before.status !== 'room') return before
    const held = before.status === 'kept' ? before.file.storageKey : null
    if (before.status === 'kept' && library && (await storage?.has(before.file.storageKey))) {
      return before
    }
    const storageKey = `${accountFolder(userId)}${randomUUID()}`
    const hours = photoLimits.uploadHeldHours
    await store.photoDeletions.dueAt(storageKey, hours)
    await storage?.put(storageKey, bytes, contentType)
    const file = { id: photoId, contentType, byteSize: bytes.byteLength, storageKey }
    const after = await store.withLockedAccount(userId, account =>
      saved(account, file, held, library)
    )
    const adopted = after !== null && 'file' in after && after.file.storageKey === storageKey
    if (!adopted) await store.photoDeletions.dueAt(storageKey, 0)
    else if (held !== null) await store.photoDeletions.dueAt(held, hours)
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
