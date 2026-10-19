import type { PhotoStorage } from '../domain/photo-files'

export class MemoryPhotoStorage implements PhotoStorage {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>()

  async put(key: string, bytes: Uint8Array, contentType: string) {
    this.objects.set(key, { bytes: bytes.slice(), contentType })
  }

  async get(key: string) {
    const stored = this.objects.get(key)
    if (!stored) return null
    const bytes = stored.bytes.slice()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      }
    })
    return { body, size: bytes.byteLength }
  }

  async has(key: string) {
    return this.objects.has(key)
  }

  async delete(key: string) {
    this.objects.delete(key)
  }

  async deleteUnder(prefix: string) {
    for (const key of [...this.objects.keys()]) {
      if (key.startsWith(prefix)) this.objects.delete(key)
    }
  }
}
