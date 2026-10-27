import type { Database } from '@sqlite.org/sqlite-wasm'
import {
  type AttachmentName,
  attachments,
  checkArtifact
} from '@zenbu/dictionary-core/artifact/database'
import { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import {
  KanjiData,
  type KanjiElementFile,
  type KanjiReferenceFile
} from '@zenbu/dictionary-core/artifact/kanji-data'
import {
  type RetiredEntriesFile,
  retiredEntries,
  retiredEntriesFile
} from '@zenbu/dictionary-core/artifact/retired'
import {
  type IpadicFile,
  ipadicFiles,
  ipadicTokenizer
} from '@zenbu/dictionary-core/examples/ipadic'
import { databaseName, type Installed, keptPath } from './installer'
import {
  artifactFile,
  firstAttachments,
  kanjiFiles,
  kuromojiFile,
  laterAttachments
} from './release-files'
import { attachedPath, type Pool, poolArtifact } from './sqlite'
import type { Storage } from './storage'

type ReadOnlyDatabase = new (filename: string, flags: 'r') => Database

export interface OpenDictionary {
  dictionary: Dictionary
  attached: readonly AttachmentName[]
  close(): void
}

async function unpacked(bytes: Uint8Array): Promise<ArrayBuffer> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

export async function openDictionary(
  pool: Pool,
  storage: Storage,
  installed: Installed
): Promise<OpenDictionary> {
  const sha256 = (name: string) => {
    const found = installed.files[name]
    if (!found) throw new Error(`The installed language data has no ${name}.`)
    return found
  }
  const read = async (name: string) => {
    const bytes = await storage.read(keptPath(name, sha256(name)))
    if (!bytes) throw new Error(`${name} is missing from the installed language data.`)
    return bytes
  }
  const json = async <T>(name: string) =>
    JSON.parse(new TextDecoder().decode(await read(name))) as T

  const attached = [
    ...firstAttachments,
    ...laterAttachments.filter(name => attachments[name].file in installed.files)
  ]
  const main = new (pool.OpfsSAHPoolDb as unknown as ReadOnlyDatabase)(
    databaseName(sha256(artifactFile)),
    'r'
  )
  const db = poolArtifact(main)
  try {
    main.exec('PRAGMA temp_store = memory')
    for (const name of attached) {
      const path = attachedPath(databaseName(sha256(attachments[name].file)))
      main.exec(`ATTACH DATABASE '${path}' AS ${name}`)
    }
    checkArtifact(db, sha256(artifactFile), attached)
    const kanji = new KanjiData(
      await json<KanjiReferenceFile>(kanjiFiles[0]),
      await json<KanjiElementFile>(kanjiFiles[1])
    )
    const retired = retiredEntries(
      await json<RetiredEntriesFile>(retiredEntriesFile),
      sha256(artifactFile)
    )
    const ipadic = new Map<string, ArrayBuffer>()
    for (const file of ipadicFiles) ipadic.set(file, await unpacked(await read(kuromojiFile(file))))
    const tokenize = ipadicTokenizer((file: IpadicFile) => {
      const buffer = ipadic.get(file)
      if (!buffer) throw new Error(`The installed language data has no ${kuromojiFile(file)}.`)
      return buffer
    })
    return {
      dictionary: new Dictionary({ db, kanji, retired, attached, capabilities: { tokenize } }),
      attached,
      close: () => db.close()
    }
  } catch (error) {
    db.close()
    throw error
  }
}
