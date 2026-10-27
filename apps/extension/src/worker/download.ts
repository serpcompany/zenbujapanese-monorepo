import { createSHA256, type IHasher } from 'hash-wasm'
import { type Fetch, fileKey, languageDataUrl, type ReleaseFile, sha256Hex } from './release'
import type { FileAccess, Storage } from './storage'

export type Progress = (bytes: number) => void

interface Saved {
  parts: number
  offset: number
  hash: number[]
}

const stagingPath = (file: Pick<ReleaseFile, 'sha256'>) => `staging/${file.sha256}`

const savedPath = (file: Pick<ReleaseFile, 'sha256'>) => `staging/${file.sha256}.json`

export const donePath = (file: Pick<ReleaseFile, 'sha256'>) => `staging/${file.sha256}.done`

export const downloadBytes = (file: ReleaseFile) =>
  file.parts ? file.parts.reduce((sum, part) => sum + part.bytes, 0) : file.bytes

async function fetchedBody(fetch: Fetch, key: string, name: string) {
  const response = await fetch(languageDataUrl(key))
  if (!response.ok || !response.body) throw new Error(`${name}: ${key} answered ${response.status}`)
  return response
}

async function resume(
  storage: Storage,
  file: ReleaseFile,
  access: FileAccess,
  hasher: IHasher
): Promise<Saved> {
  const bytes = file.parts ? await storage.read(savedPath(file)) : null
  const saved = bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as Saved) : null
  if (!saved || saved.offset > access.size()) {
    access.truncate(0)
    return { parts: 0, offset: 0, hash: [] }
  }
  hasher.load(Uint8Array.from(saved.hash))
  access.truncate(saved.offset)
  return saved
}

async function eachChunk(body: ReadableStream<Uint8Array>, take: (chunk: Uint8Array) => void) {
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    take(value)
  }
}

async function write(
  body: ReadableStream<Uint8Array>,
  access: FileAccess,
  hasher: IHasher,
  from: number,
  progress: Progress
): Promise<number> {
  let offset = from
  await eachChunk(body, chunk => {
    hasher.update(chunk)
    access.write(chunk, offset)
    offset += chunk.byteLength
    progress(chunk.byteLength)
  })
  return offset
}

async function counted(body: ReadableStream<Uint8Array>, progress: Progress) {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  await eachChunk(body, chunk => {
    chunks.push(chunk as Uint8Array<ArrayBuffer>)
    progress(chunk.byteLength)
  })
  return new Uint8Array(await new Blob(chunks).arrayBuffer())
}

const unreported: Progress = () => undefined

const unpacked = (packed: Uint8Array) =>
  new Blob([packed as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('gzip')) as ReadableStream<Uint8Array>

async function writeParts(
  fetch: Fetch,
  storage: Storage,
  file: ReleaseFile & { parts: NonNullable<ReleaseFile['parts']> },
  access: FileAccess,
  hasher: IHasher,
  progress: Progress
): Promise<number> {
  const saved = await resume(storage, file, access, hasher)
  progress(downloadBytes({ ...file, parts: file.parts.slice(0, saved.parts) }))
  let offset = saved.offset
  for (let index = saved.parts; index < file.parts.length; index++) {
    const part = file.parts[index]
    const response = await fetchedBody(fetch, part.key, file.name)
    const packed = await counted(response.body as ReadableStream<Uint8Array>, progress)
    const actual = await sha256Hex(packed)
    if (actual !== part.sha256) {
      throw new Error(
        `${file.name} part ${index + 1} is ${actual}, but compressed.json pins ${part.sha256}`
      )
    }
    offset = await write(unpacked(packed), access, hasher, offset, unreported)
    access.flush()
    const next: Saved = { parts: index + 1, offset, hash: [...hasher.save()] }
    await storage.write(savedPath(file), new TextEncoder().encode(JSON.stringify(next)))
  }
  return offset
}

async function writeWhole(
  fetch: Fetch,
  file: ReleaseFile,
  access: FileAccess,
  hasher: IHasher,
  progress: Progress
): Promise<number> {
  access.truncate(0)
  const response = await fetchedBody(fetch, fileKey(file), file.name)
  return write(response.body as ReadableStream<Uint8Array>, access, hasher, 0, progress)
}

export async function download(
  fetch: Fetch,
  storage: Storage,
  file: ReleaseFile,
  progress: Progress
): Promise<string> {
  const access = await storage.access(stagingPath(file))
  const hasher = await createSHA256()
  hasher.init()
  try {
    const { parts } = file
    const written = parts
      ? await writeParts(fetch, storage, { ...file, parts }, access, hasher, progress)
      : await writeWhole(fetch, file, access, hasher, progress)
    access.flush()
    const actual = hasher.digest('hex')
    if (actual !== file.sha256 || written !== file.bytes) {
      access.truncate(0)
      await storage.remove(savedPath(file))
      throw new Error(`${file.name} is ${actual}, but the manifest pins ${file.sha256}`)
    }
  } finally {
    access.close()
  }
  await storage.remove(savedPath(file))
  return stagingPath(file)
}
