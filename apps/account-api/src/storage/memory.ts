import type { PhotoStorage } from '../domain/photo-files'

export class MemoryPhotoStorage implements PhotoStorage {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>()

  async put(key: string, bytes: Uint8Array, contentType: string) {
    this.objects.set(key, { bytes: bytes.slice(), contentType })
  }

  async get(key: string) {
    return this.objects.get(key)?.bytes.slice() ?? null
  }

  async delete(key: string) {
    this.objects.delete(key)
  }
}
