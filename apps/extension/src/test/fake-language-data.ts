import type { WorkerData } from '../worker/answer'
import type { DatabasePool } from '../worker/installer'
import { type Fetch, languageDataUrl } from '../worker/release'
import { artifactFile, firstSet, type Listed, laterSet } from '../worker/release-files'
import type { FileAccess, Storage } from '../worker/storage'
import { publishRelease, releasesIndex } from './publish-release'

const schemas: ReadonlyMap<string, string | null> = new Map([...firstSet, ...laterSet])

export const releaseFiles = [...schemas.keys()]

const encoded = (text: string) => new TextEncoder().encode(text)

export const contentOf = (name: string, release: string) =>
  encoded(`${name} of ${release} `.repeat(name === artifactFile ? 6 : 2))

export interface Published {
  release: string
  changed?: readonly string[]
  schema?: Record<string, string>
  manifestSha256?: string
  partSha256?: string
}

export class LanguageDataServer {
  readonly objects = new Map<string, Uint8Array>()
  readonly asked: string[] = []
  private readonly listed: Listed[] = []
  failAfter: number | null = null
  failOn: ((key: string) => boolean) | null = null

  constructor(readonly partBytes = 64) {}

  async publish({ release, changed, schema, manifestSha256, partSha256 }: Published) {
    const previous = this.listed.at(-1)?.release
    const files = releaseFiles.map(name => {
      const from = previous && changed && !changed.includes(name) ? previous : release
      return {
        name,
        bytes: contentOf(name, from),
        schema: schema?.[name] ?? schemas.get(name) ?? null
      }
    })
    const published = await publishRelease({
      release,
      files,
      partBytes: this.partBytes,
      publishedAt: `2026-10-${String(this.listed.length + 10)}T00:00:00Z`,
      manifestSha256,
      partSha256
    })
    for (const [key, bytes] of published.objects) this.objects.set(key, bytes)
    this.listed.push(published.listed)
    this.objects.set('releases.json', releasesIndex(this.listed))
  }

  readonly fetch: Fetch = async url => {
    const key = url.slice(languageDataUrl('').length)
    if ((this.failAfter !== null && this.asked.length >= this.failAfter) || this.failOn?.(key)) {
      throw new TypeError('Failed to fetch')
    }
    this.asked.push(key)
    const bytes = this.objects.get(key)
    return bytes
      ? new Response(bytes as Uint8Array<ArrayBuffer>)
      : new Response(null, { status: 404 })
  }
}

export class MemoryStorage implements Storage {
  readonly files = new Map<string, Uint8Array>()

  async access(path: string): Promise<FileAccess> {
    const files = this.files
    if (!files.has(path)) files.set(path, new Uint8Array())
    const current = () => files.get(path) ?? new Uint8Array()
    const resize = (size: number) => {
      const next = new Uint8Array(size)
      next.set(current().subarray(0, size))
      files.set(path, next)
    }
    return {
      size: () => current().byteLength,
      read(into, at) {
        const bytes = current().subarray(at, at + into.byteLength)
        into.set(bytes)
        return bytes.byteLength
      },
      write(bytes, at) {
        if (at + bytes.byteLength > current().byteLength) resize(at + bytes.byteLength)
        current().set(bytes, at)
      },
      truncate: resize,
      flush: () => undefined,
      close: () => undefined
    }
  }

  async read(path: string) {
    return this.files.get(path) ?? null
  }

  async write(path: string, bytes: Uint8Array) {
    this.files.set(path, bytes)
  }

  async move(from: string, to: string) {
    const bytes = this.files.get(from)
    if (!bytes) throw new Error(`No ${from}`)
    this.files.delete(from)
    this.files.set(to, bytes)
  }

  async remove(path: string) {
    for (const name of [...this.files.keys()]) {
      if (name === path || name.startsWith(`${path}/`)) this.files.delete(name)
    }
  }

  async list(folder: string) {
    const inside = [...this.files.keys()].filter(name => name.startsWith(`${folder}/`))
    return [...new Set(inside.map(name => name.slice(folder.length + 1).split('/')[0]))]
  }
}

export class MemoryPool implements DatabasePool {
  readonly databases = new Map<string, Uint8Array>()
  most = 0

  constructor(readonly capacity = 16) {}

  async importDb(name: string, chunk: () => Uint8Array | undefined) {
    if (!this.databases.has(name) && this.databases.size >= this.capacity) {
      throw new Error('No available handles to import to.')
    }
    const chunks: number[] = []
    for (let next = chunk(); next; next = chunk()) chunks.push(...next)
    this.databases.set(name, Uint8Array.from(chunks))
    this.most = Math.max(this.most, this.databases.size)
    return chunks.length
  }

  unlink(name: string) {
    return this.databases.delete(name)
  }

  getFileNames() {
    return [...this.databases.keys()]
  }
}

export const installing: WorkerData = {
  state: () => ({ state: 'downloading', done: 0, total: 1 }),
  open: () => null,
  update: () => undefined
}
