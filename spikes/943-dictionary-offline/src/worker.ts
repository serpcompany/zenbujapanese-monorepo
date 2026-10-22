import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { createSHA256, type IHasher } from 'hash-wasm'
import { type ArtifactDatabase, attachments, type SqlValue } from '../../../packages/dictionary-core/src/artifact/database'
import { Dictionary } from '../../../packages/dictionary-core/src/artifact/dictionary'
import { KanjiData } from '../../../packages/dictionary-core/src/artifact/kanji-data'
import { retiredEntries } from '../../../packages/dictionary-core/src/artifact/retired'
import { ipadicTokenizer } from '../../../packages/dictionary-core/src/examples/ipadic'
const ipadicFiles = ['base', 'check', 'tid', 'tid_map', 'tid_pos', 'cc', 'unk', 'unk_map', 'unk_pos', 'unk_char', 'unk_invoke'] as const

const artifactFile = 'LanguageReferenceData.sqlite3'
const firstAttachments = ['compound_pitch', 'jlpt', 'tubelex', 'word_index'] as const
const laterAttachments = ['strokes', 'ranked'] as const
const firstFiles = [
  artifactFile,
  ...firstAttachments.map(name => attachments[name].file),
  'KanjiReferenceData.json',
  'KanjiElementReferenceData.json',
  'RetiredEntries.json',
  ...ipadicFiles.map(file => `Kuromoji/${file}.dat.gz`)
]
const laterFiles = laterAttachments.map(name => attachments[name].file)

interface ManifestFile {
  name: string
  sha256: string
  bytes: number
}

const timings: Record<string, number> = {}
const mark = (name: string, start: number) => {
  timings[name] = Math.round(performance.now() - start)
}

let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>> | null = null
let pool: any = null
let dictionary: Dictionary | null = null
let dictionaryOptions: any = null
let lastResetError = ""
let db: any = null

async function root() {
  return navigator.storage.getDirectory()
}

async function dir(path: string[]) {
  let d = await root()
  for (const p of path) d = await d.getDirectoryHandle(p, { create: true })
  return d
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function initSqlite() {
  if (sqlite3) return
  const start = performance.now()
  sqlite3 = await sqlite3InitModule()
  pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'zenbu-pool', initialCapacity: 12 })
  mark('sqliteInit', start)
}

async function readManifest(base: string, release: string) {
  const releases = (await (await fetch(`${base}/releases.json`, { cache: 'no-store' })).json()) as {
    releases: { release: string; manifest_sha256: string }[]
  }
  const listed = releases.releases.find(r => r.release === release)
  if (!listed) throw new Error(`releases.json has no ${release}`)
  const bytes = new Uint8Array(await (await fetch(`${base}/releases/${release}/manifest.json`)).arrayBuffer())
  const actual = await sha256Hex(bytes)
  if (actual !== listed.manifest_sha256) throw new Error(`manifest is ${actual}, releases.json pins ${listed.manifest_sha256}`)
  return JSON.parse(new TextDecoder().decode(bytes)) as { files: ManifestFile[] }
}

const chunkSize = 8 << 20

async function download(
  base: string,
  file: ManifestFile,
  compressed: boolean,
  progress: (bytes: number) => void,
  stopAfter?: number
): Promise<FileSystemFileHandle> {
  const staging = await dir(['staging'])
  const handle = await staging.getFileHandle(file.sha256, { create: true })
  const stateHandle = await staging.getFileHandle(`${file.sha256}.state`, { create: true })
  const access = await (handle as any).createSyncAccessHandle()
  const stateAccess = await (stateHandle as any).createSyncAccessHandle()
  const hasher: IHasher = await createSHA256()
  hasher.init()
  let offset = 0
  try {
    const stateSize = stateAccess.getSize()
    if (!compressed && stateSize > 8) {
      const saved = new Uint8Array(stateSize)
      stateAccess.read(saved, { at: 0 })
      const savedOffset = Number(new DataView(saved.buffer).getBigUint64(0))
      if (savedOffset <= access.getSize()) {
        hasher.load(saved.subarray(8))
        offset = savedOffset
        access.truncate(offset)
      }
    } else {
      access.truncate(0)
    }
    const saveState = () => {
      const state = hasher.save()
      const out = new Uint8Array(8 + state.length)
      new DataView(out.buffer).setBigUint64(0, BigInt(offset))
      out.set(state, 8)
      stateAccess.truncate(0)
      stateAccess.write(out, { at: 0 })
      stateAccess.flush()
    }
    if (offset < file.bytes) {
      const url = compressed
        ? `${base}/files-gz/${file.sha256}/${file.name}.gz`
        : `${base}/files/${file.sha256}/${file.name}`
      const headers: Record<string, string> = offset > 0 ? { Range: `bytes=${offset}-` } : {}
      const response = await fetch(url, { headers, cache: 'no-store' })
      if (offset > 0 && response.status !== 206) throw new Error(`no resume for ${file.name}: ${response.status}`)
      if (!response.ok) throw new Error(`${file.name}: ${response.status}`)
      let body = response.body!
      if (compressed) body = body.pipeThrough(new DecompressionStream('gzip'))
      const reader = body.getReader()
      let sinceSave = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        hasher.update(value)
        access.write(value, { at: offset })
        offset += value.byteLength
        sinceSave += value.byteLength
        progress(value.byteLength)
        if (!compressed && sinceSave >= chunkSize) {
          sinceSave = 0
          access.flush()
          saveState()
        }
        if (stopAfter != null && offset >= stopAfter) {
          access.flush()
          saveState()
          await reader.cancel()
          throw new Error(`stopped at ${offset}`)
        }
      }
    }
    access.flush()
    const actual = hasher.digest('hex')
    if (actual !== file.sha256 || offset !== file.bytes) {
      access.truncate(0)
      stateAccess.truncate(0)
      throw new Error(`${file.name} is ${actual} (${offset} bytes), the manifest pins ${file.sha256}`)
    }
  } finally {
    access.close()
    stateAccess.close()
  }
  await staging.removeEntry(`${file.sha256}.state`)
  return handle
}

async function importDatabase(name: string, handle: FileSystemFileHandle) {
  const access = await (handle as any).createSyncAccessHandle()
  const size = access.getSize()
  let at = 0
  try {
    await pool.importDb(`/${name}`, () => {
      if (at >= size) return undefined
      const chunk = new Uint8Array(Math.min(chunkSize, size - at))
      access.read(chunk, { at })
      at += chunk.byteLength
      return chunk
    })
  } finally {
    access.close()
  }
}

async function keepFile(file: ManifestFile, handle: FileSystemFileHandle) {
  const files = await dir(['files'])
  await (handle as any).move(files, file.name.replaceAll('/', '_'))
}

async function readKept(name: string): Promise<ArrayBuffer> {
  const files = await dir(['files'])
  const handle = await files.getFileHandle(name.replaceAll('/', '_'))
  return (await handle.getFile()).arrayBuffer()
}

async function installed(): Promise<Record<string, string>> {
  try {
    const text = new TextDecoder().decode(await readKept('installed.json'))
    return JSON.parse(text)
  } catch {
    return {}
  }
}

async function writeInstalled(value: Record<string, string>) {
  const files = await dir(['files'])
  const handle = await files.getFileHandle('installed.json', { create: true })
  const writable = await (handle as any).createWritable()
  await writable.write(JSON.stringify(value))
  await writable.close()
}

async function install(options: { base: string; release: string; compressed: boolean; later?: boolean; stopAfter?: number }) {
  await initSqlite()
  const start = performance.now()
  const manifest = await readManifest(options.base, options.release)
  mark('manifest', start)
  const wanted = options.later ? laterFiles : firstFiles
  const byName = new Map(manifest.files.map(f => [f.name, f]))
  const files = wanted.map(name => byName.get(name) ?? (() => { throw new Error(`manifest lacks ${name}`) })())
  const done = await installed()
  const total = files.reduce((sum, f) => sum + f.bytes, 0)
  let received = 0
  let lastReport = 0
  const report = (bytes: number) => {
    received += bytes
    if (performance.now() - lastReport > 500) {
      lastReport = performance.now()
      postMessage({ type: 'progress', received, total })
    }
  }
  let downloadMs = 0
  let importMs = 0
  for (const file of files) {
    if (done[file.name] === file.sha256) continue
    const d0 = performance.now()
    const handle = await download(options.base, file, options.compressed && file.name.endsWith('.sqlite3'), report, file.name === artifactFile ? options.stopAfter : undefined)
    downloadMs += performance.now() - d0
    if (file.name.endsWith('.sqlite3')) {
      const i0 = performance.now()
      await importDatabase(file.name, handle)
      await (await dir(['staging'])).removeEntry(file.sha256)
      importMs += performance.now() - i0
    } else {
      await keepFile(file, handle)
    }
    done[file.name] = file.sha256
    await writeInstalled(done)
  }
  timings.downloadAndHash = Math.round(downloadMs)
  timings.importIntoPool = Math.round(importMs)
  mark('install', start)
  return { total, files: files.length }
}

class PoolArtifact implements ArtifactDatabase {
  private readonly statements = new Map<string, any>()
  constructor(private readonly database: any) {}
  trace: { sql: string; ms: number; rows: number }[] | null = null
  all<Row>(sql: string, params: readonly SqlValue[] = []): Row[] {
    const traceStart = performance.now()
    let statement = this.statements.get(sql)
    if (!statement) {
      try { statement = this.database.prepare(sql) } catch (error) { throw new Error(`${error} in ${sql.replace(/\s+/g, " ").slice(0, 300)}`) }
      this.statements.set(sql, statement)
    }
    try {
      if (params.length > 0) statement.bind(params as SqlValue[])
      const rows: Row[] = []
      while (statement.step()) rows.push(statement.get({}) as Row)
      if (this.trace) this.trace.push({ sql: sql.replace(/\s+/g, ' ').slice(0, 160), ms: Math.round((performance.now() - traceStart) * 100) / 100, rows: rows.length })
      return rows
    } catch (error) {
      throw new Error(`${error} in ${sql.replace(/\s+/g, ' ').slice(0, 300)}`)
    } finally {
      try { statement.reset(true) } catch (error) { console.error('reset', String(error), sql.replace(/\s+/g, ' ').slice(0, 400)); lastResetError = `${error} in ${sql.replace(/\s+/g, ' ').slice(0, 400)}`; throw new Error(lastResetError) }
    }
  }
}

async function open() {
  if (dictionary) return
  await initSqlite()
  const start = performance.now()
  db = new pool.OpfsSAHPoolDb(`/${artifactFile}`, 'r')
  db.exec('PRAGMA temp_store = memory')
  for (const name of firstAttachments) {
    db.exec(`ATTACH DATABASE 'file:/${attachments[name].file}?vfs=zenbu-pool&mode=ro' AS ${name}`)
  }
  const done = await installed()
  for (const name of laterAttachments) {
    if (done[attachments[name].file]) {
      db.exec(`ATTACH DATABASE 'file:/${attachments[name].file}?vfs=zenbu-pool&mode=ro' AS ${name}`)
    }
  }
  const artifact = new PoolArtifact(db)
  mark('openDatabase', start)
  const k0 = performance.now()
  const json = async (name: string) => JSON.parse(new TextDecoder().decode(await readKept(name)))
  const kanji = new KanjiData(await json('KanjiReferenceData.json'), await json('KanjiElementReferenceData.json'))
  const retired = retiredEntries(await json('RetiredEntries.json'), done[artifactFile])
  mark('kanjiAndRetired', k0)
  const t0 = performance.now()
  const unpacked = new Map<string, ArrayBuffer>()
  for (const file of ipadicFiles) {
    const packed = await readKept(`Kuromoji/${file}.dat.gz`)
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))
    unpacked.set(file, await new Response(stream).arrayBuffer())
  }
  const tokenize = ipadicTokenizer(file => unpacked.get(file)!)
  tokenize('')
  mark('tokenizer', t0)
  dictionaryOptions = { db: artifact, kanji, retired, capabilities: { tokenize } }
  dictionary = new Dictionary(dictionaryOptions)
  mark('open', start)
}

async function lookup(word: string) {
  const start = performance.now()
  const response = await dictionary!.search(word)
  const screen = response.screen as any
  const first = screen.state === 'results' ? screen.rows[0] : null
  return {
    ms: performance.now() - start,
    first: first && { entSeq: first.entSeq, headword: first.headword, reading: first.reading, summary: first.summary, chips: first.chips.map((c: any) => c.label ?? c.name ?? c) },
    count: screen.state === 'results' ? screen.resultCount : 0
  }
}

function memory() {
  const wasm = (sqlite3 as any)?.wasm
  const pageCache = db ? db.selectValue('PRAGMA cache_size') : null
  const capi = (sqlite3 as any)?.capi
  let cacheUsed: number | null = null
  try {
    const out = wasm.pstack.pointer
    try {
      const cur = wasm.pstack.allocPtr()
      const hi = wasm.pstack.allocPtr()
      capi.sqlite3_db_status(db.pointer, capi.SQLITE_DBSTATUS_CACHE_USED, cur, hi, 0)
      cacheUsed = wasm.peek32(cur)
    } finally {
      wasm.pstack.restore(out)
    }
  } catch {}
  return {
    wasmHeapBytes: wasm?.heap8u().byteLength ?? null,
    pageCacheUsedBytes: cacheUsed,
    cacheSize: pageCache,
    workerJsHeap: (performance as any).memory ? { used: (performance as any).memory.usedJSHeapSize, total: (performance as any).memory.totalJSHeapSize } : null
  }
}

const handlers: Record<string, (arg: any) => Promise<unknown> | unknown> = {
  install: install,
  open: open,
  status: async () => ({ installed: await installed(), open: !!dictionary, timings }),
  lookup: (word: string) => lookup(word),
  segment: (text: string) => {
    const start = performance.now()
    const tokens = dictionary!.segment(text)
    return { ms: performance.now() - start, tokens: tokens.length }
  },
  popup: async ({ text, offset }: { text: string; offset: number }) => {
    const start = performance.now()
    const tokens = dictionary!.segment(text) as any[]
    let at = 0
    let token = tokens[0]
    for (const t of tokens) {
      const length = (t.text ?? t.surface ?? '').length
      if (offset >= at && offset < at + length) {
        token = t
        break
      }
      at += length
    }
    const found = token ? await lookup(token.text ?? token.surface) : null
    return { ms: performance.now() - start, token: token && { text: token.text, reading: token.reading, id: token.languageReferenceID }, found }
  },
  word: (entSeq: number) => {
    const start = performance.now()
    const word = dictionary!.word(entSeq)
    return { ms: performance.now() - start, found: !!word, slug: word?.slug }
  },
  sql: (sql: string) => db.selectObjects(sql),
  memory,
  traceLookup: async (word: string) => {
    dictionary = new Dictionary(dictionaryOptions)
    const artifact = dictionaryOptions.db as PoolArtifact
    artifact.trace = []
    const start = performance.now()
    if (/^\d+$/.test(word)) dictionary.word(Number(word))
    else await dictionary.search(word)
    const total = performance.now() - start
    const trace = artifact.trace
    artifact.trace = null
    const sqlMs = trace.reduce((a, t) => a + t.ms, 0)
    return { total, sqlMs, statements: trace.length, slowest: [...trace].sort((a, b) => b.ms - a.ms).slice(0, 8) }
  },
  benchCore: async ({ words, mode }: { words: string[]; mode: string }) => {
    dictionary = new Dictionary(dictionaryOptions)
    const times: number[] = []
    const linked: string[] = []
    for (const word of words) {
      const start = performance.now()
      if (mode === 'search') await dictionary.search(word)
      else if (mode === 'searchResults') await dictionary.searchResults(word)
      else if (mode === 'segmentThenEntry') {
        const token = dictionary.segment(word).find(t => t.languageReferenceID)
        if (token) {
          const artifact = dictionaryOptions.db as PoolArtifact
          const id = [token.languageReferenceID!]
          const row = artifact.all<Record<string, unknown>>('SELECT source_record_id, headword, reading, summary, senses_json, pitch_accent_json FROM entries WHERE id = unhex(?)', id)[0]
          const jlpt = artifact.all('SELECT level FROM jlpt.level_evidence WHERE language_reference_id = unhex(?)', id)
          const youtube = artifact.all('SELECT rank FROM tubelex.frequency_evidence WHERE language_reference_id = unhex(?)', id)
          if (row && JSON.parse(String(row.senses_json)) && jlpt && youtube) linked.push(word)
        }
      }
      else if (mode === 'segment') { if (dictionary.segment(word).some(token => token.languageReferenceID)) linked.push(word) }
      else {
        const linked = dictionary.segment(word).find(token => token.languageReferenceID)
        const entSeq = linked && (dictionaryOptions.db as PoolArtifact).all<{ s: number }>('SELECT source_record_id AS s FROM entries WHERE id = unhex(?)', [linked.languageReferenceID!])[0]?.s
        if (entSeq) dictionary.word(entSeq)
      }
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    const at = (p: number) => Math.round(times[Math.min(times.length - 1, Math.ceil(p * times.length) - 1)] * 10) / 10
    return { mode, linked: linked.length, n: times.length, median: at(0.5), p95: at(0.95), max: at(1), min: Math.round(times[0] * 10) / 10 }
  },
  resetCaches: () => {
    dictionary = new Dictionary(dictionaryOptions)
    return true
  },
  timings: () => timings,
  ftsProbe: () => {
    try {
      return db.selectObjects("SELECT count(*) AS n FROM dictionary_gloss_fts WHERE dictionary_gloss_fts MATCH 'eating'")
    } catch (error) {
      return { error: String((error as Error).message) }
    }
  },
  wipe: async () => {
    if (db) db.close()
    db = null
    dictionary = null
    if (pool) await pool.wipeFiles()
    const r = await root()
    for (const name of ['staging', 'files']) {
      try {
        await r.removeEntry(name, { recursive: true })
      } catch {}
    }
    return true
  },
  storage: async () => navigator.storage.estimate()
}

onmessage = async (event: MessageEvent) => {
  const { id, type, arg } = event.data
  try {
    const handler = handlers[type]
    if (!handler) throw new Error(`no ${type}`)
    postMessage({ id, value: await handler(arg) })
  } catch (error) {
    postMessage({ id, error: String((error as Error)?.message ?? error) })
  }
}
postMessage({ type: 'ready' })
