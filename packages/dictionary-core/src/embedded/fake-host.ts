import type { FrequencyDictionary } from '../detail/frequency'
import { type EmbeddedCall, embeddedEndpoint } from './dictionary'
import type { EmbeddedHost } from './host'

export interface FakeEntry {
  id: string
  entSeq?: number
  headword: string
  reading: string
  partsOfSpeech?: string[]
  readingForms?: string[]
  meanings?: string[]
}

function formRows(entries: readonly FakeEntry[], matches: (form: string) => boolean) {
  return entries.flatMap(entry =>
    [
      { form: entry.headword, kind: 0 },
      ...[entry.reading, ...(entry.readingForms ?? [])].map(form => ({ form, kind: 1 }))
    ]
      .filter(({ form }) => matches(form))
      .map(({ form, kind }) => ({
        id: entry.id,
        source_record_id: 1,
        headword: entry.headword,
        reading: entry.reading,
        summary: `${entry.headword} summary`,
        parts_of_speech_json: JSON.stringify(entry.partsOfSpeech ?? ['noun']),
        semantic_fingerprint: entry.id,
        primary_mask: null,
        secondary_mask: null,
        news_frequency_band: null,
        form,
        kind,
        sense_count: 1
      }))
  )
}

const values = (forms: readonly string[]) => JSON.stringify(forms.map(value => ({ value })))

function entryRows(entries: readonly FakeEntry[], ids: readonly string[]) {
  return entries
    .filter(entry => ids.includes(entry.id))
    .map(entry => ({
      id: entry.id,
      headword: entry.headword,
      reading: entry.reading,
      summary: `${entry.headword} summary`,
      meaning: entry.meanings?.[0] ?? null,
      parts_of_speech_json: JSON.stringify(entry.partsOfSpeech ?? ['noun']),
      written_forms_json: values([entry.headword]),
      reading_forms_json: values([entry.reading, ...(entry.readingForms ?? [])])
    }))
}

export function fakeHost(
  entries: readonly FakeEntry[],
  overrides: Partial<EmbeddedHost> = {}
): EmbeddedHost & { asked: string[][] } {
  const asked: string[][] = []
  return {
    asked,
    all(sql, parametersJSON) {
      const parameters = JSON.parse(parametersJSON) as string[]
      asked.push(parameters)
      if (sql.includes('FROM entries WHERE id IN')) {
        return { rows: entryRows(entries, JSON.parse(parameters[0]) as string[]) }
      }
      if (sql.includes('source_record_id = ?')) {
        return {
          rows: entries
            .filter(entry => entry.entSeq === Number(parameters[1]))
            .map(({ id }) => ({ id }))
        }
      }
      if (sql.includes('FROM entries WHERE id = unhex(?)')) {
        return {
          rows: entries.filter(entry => entry.id === parameters[0]).map(({ id }) => ({ id }))
        }
      }
      if (!sql.includes('FROM forms f') || !sql.includes('f.kind IN (0, 1)')) return { rows: [] }
      const matches = sql.includes('f.form = ?')
        ? (form: string) => form === parameters[0]
        : sql.includes('f.form IN')
          ? (form: string) => parameters.includes(form)
          : (form: string) => form.includes(parameters[0])
      return { rows: formRows(entries, matches) }
    },
    ...overrides
  }
}

export function fakeDictionary(
  id: string,
  name: string,
  kind: FrequencyDictionary['kind'] = 'rank'
): FrequencyDictionary {
  return {
    id,
    kind,
    name,
    domain: `${name} domain`,
    description: 'Fixture',
    version: '2025.1',
    source: `${name} source`,
    coveredSourceRows: 100_000
  }
}

export interface FakeFrequencyList {
  dictionary: FrequencyDictionary
  values?: Readonly<Record<string, number>>
  unavailable?: string
}

const evidenceTables = { level: 'level_evidence', rank: 'frequency_evidence' }

export function fakeFrequency(
  lists: readonly FakeFrequencyList[]
): Required<Pick<EmbeddedHost, 'frequencyLists' | 'frequencyListRows'>> & { read: string[][] } {
  const read: string[][] = []
  return {
    read,
    frequencyLists: () => ({
      lists: lists.map(({ dictionary, unavailable }) =>
        unavailable === undefined ? { dictionary } : { dictionary, unavailable }
      )
    }),
    frequencyListRows(id, sql, parametersJSON) {
      const list = lists.find(({ dictionary }) => dictionary.id === id)
      const values = list?.values
      if (!list || !values) return { error: 'unable to open database file' }
      if (!sql.includes(`FROM ${evidenceTables[list.dictionary.kind]}`)) {
        return { error: `no such table in ${sql}` }
      }
      const [listed] = JSON.parse(parametersJSON) as string[]
      const ids = JSON.parse(listed) as string[]
      read.push([id, ...ids])
      return {
        rows: ids
          .filter(entry => Object.hasOwn(values, entry))
          .map(entry => ({ id: entry, value: values[entry] })),
        blobs: []
      }
    }
  }
}

interface Outcome {
  value?: unknown
  error?: string
  analyze?: string
}

export async function settled(call: EmbeddedCall): Promise<Outcome> {
  await new Promise(resolve => setTimeout(resolve))
  return JSON.parse(call.outcome()) as Outcome
}

export function begin(target: EmbeddedHost, method: string, argument: string): EmbeddedCall {
  return embeddedEndpoint(target).begin(method, argument)
}

export async function ask(
  target: EmbeddedHost,
  method: string,
  argument: string
): Promise<unknown> {
  const { value, error } = await settled(begin(target, method, argument))
  if (error !== undefined) throw new Error(error)
  return value
}
