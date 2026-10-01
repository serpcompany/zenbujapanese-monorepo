#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const resources = resolve(
  process.argv[2] ?? join(here, '../../ios/Modules/Sources/SearchExperience/Resources')
)
const out = resolve(process.argv[3] ?? join(here, '../.sudachi/system_core.dic'))

const catalog = JSON.parse(
  readFileSync(join(resources, 'LanguageTechnologyPackCatalog.json'), 'utf8')
)
const pack = catalog.packs.find(candidate => candidate.engine === 'sudachi.rs')
if (!pack) throw new Error('The app catalogs no Sudachi pack')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

if (existsSync(out) && sha256(readFileSync(out)) === pack.installedSHA256) {
  console.log(`${out} is already ${pack.packID}`)
  process.exit(0)
}

console.log(`Downloading ${pack.downloadURL}`)
const response = await fetch(pack.downloadURL)
if (!response.ok) throw new Error(`${pack.downloadURL}: ${response.status}`)
const archive = Buffer.from(await response.arrayBuffer())
if (sha256(archive) !== pack.downloadSHA256) {
  throw new Error(`The download is ${sha256(archive)}, not ${pack.downloadSHA256}`)
}

const endOfCentralDirectorySignature = Buffer.from([0x50, 0x4b, 0x05, 0x06])
const centralDirectoryHeaderSignature = 0x02014b50
const storedMethod = 0
const deflatedMethod = 8

function zipEntry(zip, name) {
  const end = zip.lastIndexOf(endOfCentralDirectorySignature)
  if (end < 0) throw new Error('Not a ZIP archive')
  let offset = zip.readUInt32LE(end + 16)
  const count = zip.readUInt16LE(end + 10)
  for (let index = 0; index < count; index++) {
    if (zip.readUInt32LE(offset) !== centralDirectoryHeaderSignature) {
      throw new Error('A damaged ZIP directory')
    }
    const method = zip.readUInt16LE(offset + 10)
    const compressed = zip.readUInt32LE(offset + 20)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const local = zip.readUInt32LE(offset + 42)
    const entryName = zip.toString('utf8', offset + 46, offset + 46 + nameLength)
    if (entryName === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      const data = zip.subarray(start, start + compressed)
      if (method === storedMethod) return data
      if (method === deflatedMethod) return inflateRawSync(data)
      throw new Error(`${name} uses ZIP method ${method}`)
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  throw new Error(`The archive has no ${name}`)
}

const dictionary = zipEntry(archive, pack.archiveEntry)
if (sha256(dictionary) !== pack.installedSHA256) {
  throw new Error(`${pack.archiveEntry} is ${sha256(dictionary)}, not ${pack.installedSHA256}`)
}
mkdirSync(dirname(out), { recursive: true })
writeFileSync(`${out}.partial`, dictionary)
renameSync(`${out}.partial`, out)
console.log(`Wrote ${pack.packID} to ${out}`)
