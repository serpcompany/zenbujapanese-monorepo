import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { gunzipSync } from 'node:zlib'
import { type ArtifactDatabase, attachments, type SqlValue } from '../../packages/dictionary-core/src/artifact/database'
import { Dictionary } from '../../packages/dictionary-core/src/artifact/dictionary'
import { KanjiData } from '../../packages/dictionary-core/src/artifact/kanji-data'
import { retiredEntries } from '../../packages/dictionary-core/src/artifact/retired'
import { ipadicTokenizer } from '../../packages/dictionary-core/src/examples/ipadic'
import { words } from './src/bench'

const repo = join(process.cwd(), '../..')
const resources = join(repo, 'apps/ios/Modules/Sources/SearchExperience/Resources')
const manifest = JSON.parse(readFileSync(join(repo, 'language-data/releases/2026.10.3/manifest.json'), 'utf8'))
const sha = (name: string) => manifest.files.find((f: { name: string }) => f.name === name).sha256

class Native implements ArtifactDatabase {
  private readonly statements = new Map<string, StatementSync>()
  constructor(readonly database: DatabaseSync) {}
  all<Row>(sql: string, params: readonly SqlValue[] = []): Row[] {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.database.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement.all(...(params as (string | number | null | Uint8Array)[])) as Row[]
  }
}

const database = new DatabaseSync(process.env.LRD ?? join(resources, 'LanguageReferenceData.sqlite3'), { readOnly: true })
for (const [name, attachment] of Object.entries(attachments)) database.exec(`ATTACH DATABASE 'file:${join(resources, attachment.file)}?mode=ro' AS ${name}`)
const db = new Native(database)
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const kanji = new KanjiData(json(join(resources, 'KanjiReferenceData.json')), json(join(resources, 'KanjiElementReferenceData.json')))
const retired = retiredEntries(json(join(repo, 'language-data/derived/RetiredEntries.json')), sha('LanguageReferenceData.sqlite3'))
const tokenize = ipadicTokenizer(file => {
  const bytes = gunzipSync(readFileSync(join(resources, 'Kuromoji', `${file}.dat.gz`)))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
})
const options = { db, kanji, retired, capabilities: { tokenize } }
if (!process.env.LRD) await new Dictionary(options).search('水')

for (const mode of (process.env.MODES ?? 'search,searchResults,segmentThenEntry').split(',')) {
  const dictionary = new Dictionary(options)
  const times: number[] = []
  const linked: string[] = []
  for (const word of words) {
    const start = performance.now()
    if (mode === 'search') await dictionary.search(word)
    else if (mode === 'searchResults') await dictionary.searchResults(word)
    else {
      const token = dictionary.segment(word).find(t => t.languageReferenceID)
      if (token) {
        const id = [token.languageReferenceID!]
        const row = db.all<Record<string, unknown>>('SELECT source_record_id, headword, reading, summary, senses_json, pitch_accent_json FROM entries WHERE id = unhex(?)', id)[0]
        db.all('SELECT level FROM jlpt.level_evidence WHERE language_reference_id = unhex(?)', id)
        db.all('SELECT rank FROM tubelex.frequency_evidence WHERE language_reference_id = unhex(?)', id)
        if (row && JSON.parse(String(row.senses_json))) linked.push(`${word}=${row.headword}`)
      }
    }
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  const at = (p: number) => Math.round(times[Math.min(times.length - 1, Math.ceil(p * times.length) - 1)] * 10) / 10
  console.log(JSON.stringify({ engine: `node:sqlite ${process.versions.sqlite}`, db: process.env.LRD ? 'page-lookup build' : 'full', mode, linked: linked.length, sample: linked.slice(0, 6).join(' '), n: times.length, median: at(0.5), p95: at(0.95), max: at(1) }))
}
