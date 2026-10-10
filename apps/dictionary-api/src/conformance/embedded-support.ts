import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ArtifactDatabase, SqlValue } from '@zenbu/dictionary-core/artifact/database'
import type {
  KanjiElementFile,
  KanjiElementSources,
  KanjiReferenceFile
} from '@zenbu/dictionary-core/artifact/kanji-data'
import { type EmbeddedEndpoint, embeddedEndpoint } from '@zenbu/dictionary-core/embedded/dictionary'
import type { EmbeddedHost, HostRows } from '@zenbu/dictionary-core/embedded/host'
import type { EmbeddedEntry } from '@zenbu/dictionary-core/embedded/presentation'
import type { EmbeddedToken } from '@zenbu/dictionary-core/embedded/text'
import type { FrequencyEvidence } from '@zenbu/dictionary-core/results/learner'
import { artifactDatabase, artifactTokenize, resources } from './support'

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

function answering(db: ArtifactDatabase) {
  return (sql: string, parametersJSON: string): HostRows => {
    try {
      const rows = db.all<Record<string, unknown>>(sql, JSON.parse(parametersJSON) as SqlValue[])
      const blobs = new Set<string>()
      for (const row of rows) {
        for (const [column, value] of Object.entries(row)) {
          if (!(value instanceof Uint8Array)) continue
          blobs.add(column)
          row[column] = hex(value)
        }
      }
      return { rows, blobs: [...blobs] }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }
}

const json = (name: string) => JSON.parse(readFileSync(join(resources, name), 'utf8'))

export interface Embedded {
  lookup<Answer>(method: string, argument: string): Promise<Answer>
  text<Answer>(method: string, argument: unknown): Promise<Answer>
  presentation<Answer>(method: string, argument: unknown): Promise<Answer>
}

function asking(endpoint: EmbeddedEndpoint) {
  return async <Answer>(method: string, argument: unknown): Promise<Answer> => {
    const call = endpoint.begin(
      method,
      typeof argument === 'string' ? argument : JSON.stringify(argument)
    )
    const settled = async () => {
      await new Promise(resolve => setTimeout(resolve))
      return JSON.parse(call.outcome()) as { value?: Answer; error?: string; analyze?: string }
    }
    let outcome = await settled()
    if (outcome.analyze !== undefined) {
      call.analyzed(JSON.stringify({ error: 'This host has no analyzer' }))
      outcome = await settled()
    }
    if (outcome.error !== undefined) throw new Error(outcome.error)
    return outcome.value as Answer
  }
}

function kanjiHost(): EmbeddedHost {
  const reference = json('KanjiReferenceData.json') as KanjiReferenceFile
  const elements = json('KanjiElementReferenceData.json') as KanjiElementFile & KanjiElementSources
  const entries = new Map(reference.entries.map(entry => [entry.character, entry]))
  const structures = new Map(elements.kanji.map(entry => [entry.character, entry]))
  const glyphs = new Map(elements.elements.map(entry => [entry.glyph, entry]))
  return {
    kanjiSources: () => ({ ...reference, schema: elements.schema, elements }),
    kanjiEntry: character => entries.get(character) ?? null,
    kanjiStructure: character => structures.get(character) ?? null,
    kanjiElement: glyph => glyphs.get(glyph) ?? null
  }
}

export async function embedded(): Promise<Embedded> {
  const all = answering(await artifactDatabase())
  const hosts: Record<keyof Embedded, EmbeddedHost> = {
    lookup: { all },
    text: { all, tokenize: await artifactTokenize() },
    presentation: kanjiHost()
  }
  return {
    lookup: asking(embeddedEndpoint(hosts.lookup)),
    text: asking(embeddedEndpoint(hosts.text)),
    presentation: asking(embeddedEndpoint(hosts.presentation))
  }
}

interface PackManifest {
  packID: string
  kind?: 'rank' | 'level'
  displayName: string
  domain: string
  domainDescription: string
  packVersion: string
  attribution: string
  coveredSourceRows: number
  bundled: boolean
}

const evidenceTables = [
  { schema: 'jlpt', table: 'level_evidence', column: 'level' },
  { schema: 'tubelex', table: 'frequency_evidence', column: 'rank' }
]

export function freshInstallEvidence(
  db: ArtifactDatabase,
  ids: readonly string[]
): FrequencyEvidence {
  const catalog = json('FrequencyPackCatalog.json') as { packs: PackManifest[] }
  const dictionaries = catalog.packs
    .filter(pack => pack.bundled)
    .map(pack => ({
      id: pack.packID,
      kind: pack.kind ?? ('rank' as const),
      name: pack.displayName,
      domain: pack.domain,
      description: pack.domainDescription,
      version: pack.packVersion,
      source: pack.attribution,
      coveredSourceRows: pack.coveredSourceRows
    }))
  const values = evidenceTables.map(({ schema, table, column }) => {
    const rows = db.all<{ id: string; value: number }>(
      `SELECT lower(hex(language_reference_id)) AS id, ${column} AS value FROM ${schema}.${table}
       WHERE language_reference_id IN (SELECT unhex(value) FROM json_each(?))`,
      [JSON.stringify(ids)]
    )
    return new Map(rows.map(row => [row.id, row.value]))
  })
  return {
    dictionaries,
    entries: Object.fromEntries(
      ids.map(id => [
        id,
        values.map((found, dictionary) => ({ dictionary, value: found.get(id) ?? null }))
      ])
    )
  }
}

export function entryAsTheAppReadsIt(db: ArtifactDatabase, id: string): EmbeddedEntry | null {
  const [row] = db.all<{
    id: string
    headword: string
    reading: string
    summary: string
    parts_of_speech_json: string
    written_forms_json: string
    reading_forms_json: string
    senses_json: string
    relationships_json: string
    pitch: string | null
  }>(
    `SELECT lower(hex(e.id)) AS id, e.headword, e.reading, e.summary, e.parts_of_speech_json,
       e.written_forms_json, e.reading_forms_json, e.senses_json, e.relationships_json,
       COALESCE(e.pitch_accent_json,
         (SELECT c.pitch_accent_json FROM compound_pitch.entry_pitch c WHERE c.entry_id = e.id))
         AS pitch
     FROM entries e WHERE e.id = unhex(?)`,
    [id]
  )
  if (!row) return null
  return {
    id: row.id,
    headword: row.headword,
    reading: row.reading,
    summary: row.summary,
    partsOfSpeech: JSON.parse(row.parts_of_speech_json),
    writtenForms: JSON.parse(row.written_forms_json),
    readingForms: JSON.parse(row.reading_forms_json),
    senses: JSON.parse(row.senses_json),
    relationships: JSON.parse(row.relationships_json),
    pitch: row.pitch ? JSON.parse(row.pitch) : null
  }
}

export interface EmbeddedSentence {
  id: string
  japanese: string
  english: string
}

type Mark = 'pageWord' | 'highlighted' | 'queryMatch'

const marked: Record<Mark, (token: EmbeddedToken) => boolean> = {
  pageWord: token => token.isPageWord,
  highlighted: token => token.matchesQuery,
  queryMatch: token => token.matchesQuery
}

export async function shownAsTheAppLinks(
  app: Embedded,
  sentences: readonly EmbeddedSentence[],
  highlighted: { query: string; highlightedEntry: string | null },
  mark: Mark
) {
  const shown = []
  for (const sentence of sentences) {
    const tokens = await app.text<EmbeddedToken[]>('linkedTokens', {
      text: sentence.japanese,
      ...highlighted
    })
    shown.push({
      ...sentence,
      tokens: tokens.map(token => ({
        surface: token.surface,
        ...(token.entry ? { entry: token.entry } : {}),
        ...(token.candidates.length > 0 ? { candidates: token.candidates } : {}),
        ...(marked[mark](token) ? { [mark]: true } : {})
      }))
    })
  }
  return shown
}
