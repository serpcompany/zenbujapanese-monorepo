import {
  type Compressed,
  fileKey,
  type Listed,
  type ManifestFile,
  type Part,
  packed,
  sha256Hex
} from '../worker/release-files'

interface PublishedFile {
  name: string
  bytes: Uint8Array
  schema: string | null
}

export interface Publishing {
  release: string
  files: readonly PublishedFile[]
  partBytes: number
  publishedAt: string
  manifestSha256?: string
  partSha256?: string
}

const encoded = (text: string) => new TextEncoder().encode(text)

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function partsOf(
  name: string,
  bytes: Uint8Array,
  { partBytes, partSha256 }: Publishing,
  objects: Map<string, Uint8Array>
): Promise<Part[]> {
  const parts: Part[] = []
  for (let at = 0, number = 1; at < bytes.byteLength; at += partBytes, number++) {
    const part = await gzip(bytes.subarray(at, at + partBytes))
    const digest = await sha256Hex(part)
    const key = `files/${digest}/${name}.part${number}.gz`
    objects.set(key, part)
    parts.push({ key, bytes: part.byteLength, sha256: partSha256 ?? digest })
  }
  return parts
}

export async function publishRelease(publishing: Publishing) {
  const { release, files, publishedAt } = publishing
  const objects = new Map<string, Uint8Array>()
  const listedFiles: ManifestFile[] = []
  const compressed: (Compressed['files'][number] & { sha256: string; bytes: number })[] = []
  for (const { name, bytes, schema } of files) {
    const sha256 = await sha256Hex(bytes)
    objects.set(fileKey({ name, sha256 }), bytes)
    const file = { name, sha256, bytes: bytes.byteLength }
    listedFiles.push(schema === null ? file : { ...file, artifact_schema: schema })
    if (packed(name))
      compressed.push({ ...file, parts: await partsOf(name, bytes, publishing, objects) })
  }
  const manifest = encoded(JSON.stringify({ release, files: listedFiles }))
  const manifestSha256 = publishing.manifestSha256 ?? (await sha256Hex(manifest))
  objects.set(`releases/${release}/manifest.json`, manifest)
  objects.set(
    `releases/${release}/compressed.json`,
    encoded(JSON.stringify({ manifest_sha256: manifestSha256, files: compressed }))
  )
  const listed: Listed = { release, manifest_sha256: manifestSha256, published_at: publishedAt }
  return { objects, listed }
}

export const releasesIndex = (releases: readonly Listed[]) =>
  encoded(JSON.stringify({ index_schema: 'zenbu.language-data-releases.v1', releases }))
