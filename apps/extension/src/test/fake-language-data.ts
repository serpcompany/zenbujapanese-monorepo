import { attachments } from '@zenbu/dictionary-core/artifact/database'
import { ipadicFiles } from '@zenbu/dictionary-core/examples/ipadic'
import type { WorkerData } from '../worker/answer'
import type { DatabasePool } from '../worker/installer'
import {
  artifactFile,
  type Fetch,
  fileKey,
  kuromojiFile,
  languageDataUrl,
  sha256Hex
} from '../worker/release'
import type { FileAccess, Storage } from '../worker/storage'

const schemas: Record<string, string> = {
  [artifactFile]: 'zenbu.language-reference.v2',
  ...Object.fromEntries(Object.values(attachments).map(({ file, schema }) => [file, schema])),
  'KanjiReferenceData.json': 'zenbu.kanji-reference.v2',
  'KanjiElementReferenceData.json': 'zenbu.kanji-elements.v1',
  'RetiredEntries.json': 'zenbu.retired-entries.v1'
}

const kuromoji = ipadicFiles.map(kuromojiFile)

export const releaseFiles = [...Object.keys(schemas), ...kuromoji]

const encoded = (text: string) => new TextEncoder().encode(text)

export const contentOf = (name: string, release: string) =>
  encoded(`${name} of ${release} `.repeat(name === artifactFile ? 6 : 2))

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

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
  private readonly listed: { release: string; manifest_sha256: string; published_at: string }[] = []
  failAfter: number | null = null
  failOn: ((key: string) => boolean) | null = null

  constructor(readonly partBytes = 64) {}

  async publish({ release, changed, schema, manifestSha256, partSha256 }: Published) {
    const previous = this.listed.at(-1)?.release
    const files = []
    const compressed = []
    for (const name of releaseFiles) {
      const from = previous && changed && !changed.includes(name) ? previous : release
      const bytes = contentOf(name, from)
      const sha256 = await sha256Hex(bytes)
      this.objects.set(fileKey({ name, sha256 }), bytes)
      const artifactSchema = schema?.[name] ?? schemas[name]
      files.push({ name, sha256, bytes: bytes.byteLength, artifact_schema: artifactSchema })
      if (!/\.(sqlite3|json)$/.test(name)) continue
      const parts = []
      for (let at = 0, number = 1; at < bytes.byteLength; at += this.partBytes, number++) {
        const packed = await gzip(bytes.subarray(at, at + this.partBytes))
        const digest = await sha256Hex(packed)
        const key = `files/${digest}/${name}.part${number}.gz`
        this.objects.set(key, packed)
        parts.push({ key, bytes: packed.byteLength, sha256: partSha256 ?? digest })
      }
      compressed.push({ name, sha256, bytes: bytes.byteLength, parts })
    }
    const manifest = encoded(JSON.stringify({ release, files }))
    const pinned = manifestSha256 ?? (await sha256Hex(manifest))
    this.objects.set(`releases/${release}/manifest.json`, manifest)
    this.objects.set(
      `releases/${release}/compressed.json`,
      encoded(JSON.stringify({ manifest_sha256: pinned, files: compressed }))
    )
    this.listed.push({
      release,
      manifest_sha256: pinned,
      published_at: `2026-10-${String(this.listed.length + 10)}T00:00:00Z`
    })
    this.objects.set('releases.json', encoded(JSON.stringify({ releases: this.listed })))
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
