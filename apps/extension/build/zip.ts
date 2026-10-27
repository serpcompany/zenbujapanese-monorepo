import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

export type ZipEntry = { path: string; data: Buffer }

const localHeaderSignature = 0x04034b50
const centralHeaderSignature = 0x02014b50
const endSignature = 0x06054b50
const localHeaderSize = 30
const centralHeaderSize = 46
const endSize = 22
const zipVersion = 20
const utf8Names = 0x0800
const stored = 0
const deflated = 8
const firstDosDate = (1 << 5) | 1
const longestComment = 0xffff

function header(size: number, fields: [offset: number, bytes: 2 | 4, value: number][]): Buffer {
  const buffer = Buffer.alloc(size)
  for (const [offset, bytes, value] of fields) {
    if (bytes === 2) buffer.writeUInt16LE(value, offset)
    else buffer.writeUInt32LE(value, offset)
  }
  return buffer
}

export function zipFiles(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const { path, data } of entries) {
    const name = Buffer.from(path, 'utf8')
    const compressed = deflateRawSync(data)
    const shared: [number, 2 | 4, number][] = [
      [8, 2, utf8Names],
      [10, 2, deflated],
      [14, 2, firstDosDate],
      [16, 4, crc32(data)],
      [20, 4, compressed.length],
      [24, 4, data.length],
      [28, 2, name.length]
    ]
    const local = header(localHeaderSize, [
      [0, 4, localHeaderSignature],
      [4, 2, zipVersion],
      ...shared.map(([at, bytes, value]): [number, 2 | 4, number] => [at - 2, bytes, value])
    ])
    const central = header(centralHeaderSize, [
      [0, 4, centralHeaderSignature],
      [4, 2, zipVersion],
      [6, 2, zipVersion],
      ...shared,
      [42, 4, offset]
    ])
    locals.push(local, name, compressed)
    centrals.push(central, name)
    offset += local.length + name.length + compressed.length
  }
  const directory = Buffer.concat(centrals)
  const end = header(endSize, [
    [0, 4, endSignature],
    [8, 2, entries.length],
    [10, 2, entries.length],
    [12, 4, directory.length],
    [16, 4, offset]
  ])
  return Buffer.concat([...locals, directory, end])
}

function endOfDirectory(zip: Buffer): number {
  const earliest = Math.max(0, zip.length - endSize - longestComment)
  for (let at = zip.length - endSize; at >= earliest; at--) {
    if (zip.readUInt32LE(at) === endSignature) return at
  }
  throw new Error('This file is not a zip: it has no end of central directory.')
}

function contents(method: number, data: Buffer, path: string): Buffer {
  if (method === stored) return data
  if (method === deflated) return inflateRawSync(data)
  throw new Error(
    `${path} is compressed with method ${method}; only stored and deflated files open.`
  )
}

export function unzipFiles(zip: Buffer): Map<string, Buffer> {
  const end = endOfDirectory(zip)
  const count = zip.readUInt16LE(end + 10)
  const files = new Map<string, Buffer>()
  let at = zip.readUInt32LE(end + 16)
  for (let index = 0; index < count; index++) {
    if (zip.readUInt32LE(at) !== centralHeaderSignature) {
      throw new Error('The zip has a broken central directory.')
    }
    const method = zip.readUInt16LE(at + 10)
    const size = zip.readUInt32LE(at + 20)
    const nameLength = zip.readUInt16LE(at + 28)
    const skipped = zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32)
    const local = zip.readUInt32LE(at + 42)
    const path = zip.toString('utf8', at + centralHeaderSize, at + centralHeaderSize + nameLength)
    const start =
      local + localHeaderSize + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    if (!path.endsWith('/'))
      files.set(path, contents(method, zip.subarray(start, start + size), path))
    at += centralHeaderSize + nameLength + skipped
  }
  return files
}
