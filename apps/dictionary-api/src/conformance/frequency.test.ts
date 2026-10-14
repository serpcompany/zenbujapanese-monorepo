import type { ArtifactDatabase } from '@zenbu/dictionary-core/artifact/database'
import {
  type ReadableFrequencyList,
  readFrequency
} from '@zenbu/dictionary-core/artifact/frequency'
import { defaultFrequencyPacks } from '@zenbu/dictionary-core/detail/frequency'
import { beforeAll, describe, expect, test } from 'vitest'
import { type BundledList, bundledLists } from './embedded-support'
import { resultsSuite } from './results-suite'
import { artifactAvailable, artifactDatabase, requirePinnedArtifacts } from './support'

describe.runIf(artifactAvailable)('the bundled frequency lists on the artifact', () => {
  let attached: ArtifactDatabase
  let bundled: BundledList[]

  beforeAll(async () => {
    requirePinnedArtifacts(resultsSuite.artifacts)
    attached = await artifactDatabase()
    bundled = bundledLists()
  })

  const fromItsOwnFile = ({ dictionary, file }: BundledList): ReadableFrequencyList => ({
    dictionary,
    rows: (sql, params) => file.all<Record<string, unknown>>(sql, params)
  })

  const underItsSchema = ({ dictionary }: BundledList): ReadableFrequencyList => ({
    dictionary,
    schema: defaultFrequencyPacks.find(pack => pack.id === dictionary.id)?.pack,
    rows: (sql, params) => attached.all<Record<string, unknown>>(sql, params)
  })

  test('are the two the core reads for the website, in the catalog’s order', () => {
    expect(bundled.map(list => list.dictionary.id)).toEqual(
      defaultFrequencyPacks.map(pack => pack.id)
    )
  })

  test('each answers the entry its manifest pins with the value it pins', () => {
    const ids = bundled.map(list => list.pinned.id)
    for (const read of [fromItsOwnFile, underItsSchema]) {
      const evidence = readFrequency(bundled.map(read), ids)
      for (const [position, list] of bundled.entries()) {
        expect(evidence.entries[list.pinned.id][position], list.dictionary.name).toEqual({
          dictionary: position,
          value: list.pinned.value
        })
      }
    }
  })

  test('answer every entry the results suite lists the same from their own files, as the app reads them, as under their schemas, as the service does', () => {
    const ids = [
      ...new Set(
        resultsSuite.cases.flatMap(recorded =>
          (recorded.results ?? []).map(row => row.languageReferenceID)
        )
      )
    ]
    expect(ids.length).toBeGreaterThan(500)
    const ownFiles = readFrequency(bundled.map(fromItsOwnFile), ids)
    expect(ownFiles).toEqual(readFrequency(bundled.map(underItsSchema), ids))
    const listed = Object.values(ownFiles.entries).filter(lookups =>
      lookups.some(lookup => 'value' in lookup && lookup.value !== null)
    )
    expect(listed.length).toBeGreaterThan(100)
  })

  test('look entries up by the primary key, from a list’s own file and under its schema', () => {
    for (const list of bundled) {
      const steps: string[] = []
      const planned = (
        read: ReadableFrequencyList,
        asked: ArtifactDatabase
      ): ReadableFrequencyList => ({
        ...read,
        rows(sql, params) {
          const plan = asked.all<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, params)
          steps.push(...plan.map(step => step.detail))
          return []
        }
      })
      readFrequency(
        [planned(fromItsOwnFile(list), list.file), planned(underItsSchema(list), attached)],
        [list.pinned.id]
      )
      const table = list.dictionary.kind === 'level' ? 'level_evidence' : 'frequency_evidence'
      expect(
        steps.filter(step => step.includes(table)),
        list.dictionary.name
      ).toEqual([
        `SEARCH ${table} USING PRIMARY KEY (language_reference_id=?)`,
        `SEARCH ${underItsSchema(list).schema}.${table} USING PRIMARY KEY (language_reference_id=?)`
      ])
    }
  })
})
