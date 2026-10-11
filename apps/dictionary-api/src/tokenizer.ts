import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import {
  type IpadicFile,
  ipadicTokenizer,
  type ReadIpadicFile
} from '@zenbu/dictionary-core/examples/ipadic'
import type { Tokenize } from '@zenbu/dictionary-core/examples/morphology'

const pinnedDictionaryFiles: Record<IpadicFile, string> = {
  base: '0803327762e1c93ca731e4319ab8343340f2806bb84941207782cde9d2d5a8eb',
  cc: '02b7631be0d4de3a1a75cd9f9cc51536e4f94c9e6b389b813e06ba0f6e7de765',
  check: '193ae0035fff6fe812b58d9ee730e7a7d7ee601d918481ce51075c58114f6cc9',
  tid: 'd43d831cb6fb0f0a411739cd287a6d5e998e121a8daca614df14a81a0dcac586',
  tid_map: '33efd5ffd87a70f669add093fa39dee44341d58f940844ef107c8fd98bb795b2',
  tid_pos: '60dbfc99a6ab993f30c5dab648bec6ad7f9aaefa5c14e1843837d95e509f8895',
  unk: 'f7f991cdeb9bfd3e9c0e4577cc50ee0815a11c508cccd444a9d3ab3c81521100',
  unk_char: '9a8e86fd9aff32d323fbb59f5a7006f05927a11f8173c90712cc56293aeb3225',
  unk_invoke: '6b210889548457c3006913afd12c8b525562255f2709e404604be9614a25e94c',
  unk_map: '6df12460e5477230bb6fd9641def918b699fc0a8868016b6c9f794488630509b',
  unk_pos: '5b183a29f281acc7e0542beca47b83f7985047c0a2d27e78a66f32276be5ad11'
}

export function tokenizerFiles(directory: string): ReadIpadicFile {
  const unpacked = new Map<string, ArrayBuffer>()
  for (const [file, sha256] of Object.entries(pinnedDictionaryFiles)) {
    const name = `${file}.dat.gz`
    const packed = readFileSync(join(directory, name))
    const actual = createHash('sha256').update(packed).digest('hex')
    if (actual !== sha256) {
      throw new Error(`${name} is ${actual}, not the pinned dictionary file ${sha256}`)
    }
    const bytes = gunzipSync(packed)
    unpacked.set(
      file,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    )
  }
  return file => {
    const bytes = unpacked.get(file)
    if (!bytes) throw new Error(`The tokenizer has no ${file} file`)
    return bytes
  }
}

export function loadTokenizer(directory: string): Tokenize {
  const tokenize = ipadicTokenizer(tokenizerFiles(directory))
  tokenize('')
  return tokenize
}
