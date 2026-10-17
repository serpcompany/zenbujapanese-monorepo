import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ArtifactDatabase, SqlValue } from '@zenbu/dictionary-core/artifact/database'
import type {
  KanjiElementFile,
  KanjiElementSources,
  KanjiReferenceFile
} from '@zenbu/dictionary-core/artifact/kanji-data'
import type { FrequencyDictionary } from '@zenbu/dictionary-core/detail/frequency'
import { type EmbeddedEndpoint, embeddedEndpoint } from '@zenbu/dictionary-core/embedded/dictionary'
import type { EmbeddedHost, HostRows } from '@zenbu/dictionary-core/embedded/host'
import type { EmbeddedEntry } from '@zenbu/dictionary-core/embedded/presentation'
import type {
  EmbeddedExample,
  EmbeddedExamplePage,
  EmbeddedToken
} from '@zenbu/dictionary-core/embedded/text'
import { artifactDatabase, artifactTokenizerFile, resources } from './support'

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

export function asking(endpoint: EmbeddedEndpoint) {
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

interface PackManifest {
  packID: string
  kind?: 'rank' | 'level'
  displayName: string
  domain: string
  domainDescription: string
  packVersion: string
  attribution: string
  coveredSourceRows: number
  bundledResource: string | null
  smokeTest: { languageReferenceID: string; rank: number }
}

export interface BundledList {
  dictionary: FrequencyDictionary
  file: ArtifactDatabase
  pinned: { id: string; value: number }
}

export function bundledLists(): BundledList[] {
  const catalog = json('FrequencyPackCatalog.json') as { packs: PackManifest[] }
  return catalog.packs.flatMap(pack => {
    if (!pack.bundledResource) return []
    const database = new DatabaseSync(join(resources, `${pack.bundledResource}.sqlite3`), {
      readOnly: true
    })
    return [
      {
        dictionary: {
          id: pack.packID,
          kind: pack.kind ?? 'rank',
          name: pack.displayName,
          domain: pack.domain,
          description: pack.domainDescription,
          version: pack.packVersion,
          source: pack.attribution,
          coveredSourceRows: pack.coveredSourceRows
        },
        file: {
          all<Row>(sql: string, params: readonly SqlValue[] = []) {
            return database.prepare(sql).all(...params) as Row[]
          }
        },
        pinned: { id: pack.smokeTest.languageReferenceID, value: pack.smokeTest.rank }
      }
    ]
  })
}

function freshInstallLists(): EmbeddedHost {
  const bundled = bundledLists()
  const files = new Map(bundled.map(list => [list.dictionary.id, answering(list.file)]))
  return {
    frequencyLists: () => ({ lists: bundled.map(({ dictionary }) => ({ dictionary })) }),
    frequencyListRows: (list, sql, parametersJSON) => files.get(list)?.(sql, parametersJSON) ?? null
  }
}

export async function embedded(): Promise<Embedded> {
  const all = answering(await artifactDatabase())
  const hosts: Record<keyof Embedded, EmbeddedHost> = {
    lookup: { all },
    text: { all, tokenizerFile: await artifactTokenizerFile() },
    presentation: { ...kanjiHost(), ...freshInstallLists() }
  }
  return {
    lookup: asking(embeddedEndpoint(hosts.lookup)),
    text: asking(embeddedEndpoint(hosts.text)),
    presentation: asking(embeddedEndpoint(hosts.presentation))
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
    compound_pitch: string | null
  }>(
    `SELECT lower(hex(e.id)) AS id, e.headword, e.reading, e.summary, e.parts_of_speech_json,
       e.written_forms_json, e.reading_forms_json, e.senses_json, e.relationships_json,
       e.pitch_accent_json AS pitch,
       (SELECT c.pitch_accent_json FROM compound_pitch.entry_pitch c WHERE c.entry_id = e.id)
         AS compound_pitch
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
    pitch: row.pitch ? JSON.parse(row.pitch) : null,
    compoundPitch: row.compound_pitch ? JSON.parse(row.compound_pitch) : null
  }
}

export async function everyPage<Page extends EmbeddedExamplePage>(
  page: (from: number) => Promise<Page>,
  upTo = Number.POSITIVE_INFINITY
): Promise<{ first: Page; examples: EmbeddedExample[] }> {
  const first = await page(0)
  const examples = [...first.examples]
  while (examples.length < Math.min(first.listed, upTo)) {
    const next = await page(examples.length)
    if (next.examples.length === 0) throw new Error(`No examples from ${examples.length}`)
    examples.push(...next.examples)
  }
  return { first, examples }
}

type Mark = 'pageWord' | 'highlighted' | 'queryMatch'

const accentRecordedAs: Record<Mark, EmbeddedToken['accent']> = {
  pageWord: 'entry',
  highlighted: 'query',
  queryMatch: 'query'
}

export function shownAsTheAppLinks(examples: readonly EmbeddedExample[], mark: Mark) {
  return examples.map(({ words, ...sentence }) => ({
    ...sentence,
    tokens: words.map(word => ({
      surface: word.surface,
      ...(word.entry ? { entry: word.entry } : {}),
      ...(word.candidates.length > 0 ? { candidates: word.candidates } : {}),
      ...(word.accent === accentRecordedAs[mark] ? { [mark]: true } : {})
    }))
  }))
}
