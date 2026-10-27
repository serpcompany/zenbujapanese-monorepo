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

async function write(
  body: ReadableStream<Uint8Array>,
  access: FileAccess,
  hasher: IHasher,
  from: number,
  progress: Progress
): Promise<number> {
  let offset = from
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return offset
    hasher.update(value)
    access.write(value, offset)
    offset += value.byteLength
    progress(value.byteLength)
  }
}

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
  progress(saved.offset)
  let offset = saved.offset
  for (let index = saved.parts; index < file.parts.length; index++) {
    const part = file.parts[index]
    const response = await fetchedBody(fetch, part.key, file.name)
    const packed = new Uint8Array(await response.arrayBuffer())
    const actual = await sha256Hex(packed)
    if (actual !== part.sha256) {
      throw new Error(
        `${file.name} part ${index + 1} is ${actual}, but compressed.json pins ${part.sha256}`
      )
    }
    offset = await write(unpacked(packed), access, hasher, offset, progress)
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
