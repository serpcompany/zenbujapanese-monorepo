import { languageDataOrigin } from '../shared/hosts'
import {
  type Compressed,
  firstSet,
  type Listed,
  laterSet,
  type ManifestFile,
  type Part,
  packed,
  sha256Hex
} from './release-files'

export interface ReleaseFile {
  name: string
  sha256: string
  bytes: number
  parts: Part[] | null
}

export interface Release {
  release: string
  manifestSha256: string
  first: ReleaseFile[]
  later: ReleaseFile[]
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export const languageDataUrl = (key: string) => `${languageDataOrigin}/${key}`

async function fetched(fetch: Fetch, key: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(languageDataUrl(key), init)
  if (!response.ok) throw new Error(`${key} answered ${response.status}`)
  return response
}

function readable(files: readonly ManifestFile[], wanted: ReadonlyMap<string, string | null>) {
  const byName = new Map(files.map(file => [file.name, file]))
  const picked: ManifestFile[] = []
  for (const [name, schema] of wanted) {
    const file = byName.get(name)
    if (!file || (schema !== null && file.artifact_schema !== schema)) return null
    picked.push(file)
  }
  return picked
}

async function compressedParts(fetch: Fetch, listed: Listed) {
  const response = await fetch(languageDataUrl(`releases/${listed.release}/compressed.json`))
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`compressed.json answered ${response.status}`)
  const compressed = (await response.json()) as Compressed
  if (compressed.manifest_sha256 !== listed.manifest_sha256) {
    throw new Error(`compressed.json is for manifest ${compressed.manifest_sha256}`)
  }
  return new Map(compressed.files.map(file => [file.name, file.parts]))
}

type Read = Release | 'unreadable' | 'not-packed'

async function readRelease(fetch: Fetch, listed: Listed): Promise<Read> {
  const key = `releases/${listed.release}/manifest.json`
  const bytes = new Uint8Array(await (await fetched(fetch, key)).arrayBuffer())
  const actual = await sha256Hex(bytes)
  if (actual !== listed.manifest_sha256) {
    throw new Error(`${key} is ${actual}, but releases.json pins ${listed.manifest_sha256}`)
  }
  const { files } = JSON.parse(new TextDecoder().decode(bytes)) as { files: ManifestFile[] }
  const first = readable(files, firstSet)
  const later = readable(files, laterSet)
  if (!first || !later) return 'unreadable'
  const parts = await compressedParts(fetch, listed)
  if (!parts) return 'not-packed'
  const withParts = (file: ManifestFile): ReleaseFile => ({
    name: file.name,
    sha256: file.sha256,
    bytes: file.bytes,
    parts: parts.get(file.name) ?? null
  })
  const release = {
    release: listed.release,
    manifestSha256: listed.manifest_sha256,
    first: first.map(withParts),
    later: later.map(withParts)
  }
  const unpacked = [...release.first, ...release.later].some(
    file => packed(file.name) && !file.parts
  )
  return unpacked ? 'not-packed' : release
}

export async function newestRelease(fetch: Fetch): Promise<Release> {
  const index = (await (await fetched(fetch, 'releases.json', { cache: 'no-cache' })).json()) as {
    releases: Listed[]
  }
  const newestFirst = [...index.releases].sort((a, b) =>
    b.published_at.localeCompare(a.published_at)
  )
  let notPacked = false
  for (const listed of newestFirst) {
    const release = await readRelease(fetch, listed)
    if (typeof release === 'object') return release
    notPacked ||= release === 'not-packed'
  }
  throw new Error(
    notPacked
      ? 'No published release has its gzipped copies yet. Zenbu tries again later.'
      : 'No published release has the files this version of the extension reads.'
  )
}
