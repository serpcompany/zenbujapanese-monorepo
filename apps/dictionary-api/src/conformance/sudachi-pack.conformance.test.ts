import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { sudachiContract } from '../sudachi'
import { readSuite, resources } from './support'

interface PackSuite {
  cases: {
    covers: string
    schemaVersion?: number
    packs: Record<string, unknown>[]
    analyzesWith: string | null
  }[]
}

const catalogFile = 'LanguageTechnologyPackCatalog.json'
const committed = JSON.parse(readFileSync(join(resources, catalogFile), 'utf8')) as {
  schemaVersion: number
  packs: Record<string, unknown>[]
}
const folder = mkdtempSync(join(tmpdir(), 'sudachi-pack-'))

afterAll(() => rmSync(folder, { recursive: true, force: true }))

function chosen(catalog: object): string | null {
  writeFileSync(join(folder, catalogFile), JSON.stringify(catalog))
  try {
    return sudachiContract(folder).packId
  } catch {
    return null
  }
}

describe('the Sudachi pack the service analyzes with, as the shared cases say', () => {
  test.each(readSuite<PackSuite>('sudachi-pack').cases)('$covers', ({
    schemaVersion,
    packs,
    analyzesWith
  }) => {
    const [pack] = committed.packs
    const catalog = {
      ...committed,
      schemaVersion: schemaVersion ?? committed.schemaVersion,
      packs: packs.map(fields => ({ ...pack, ...fields }))
    }
    expect(chosen(catalog)).toBe(analyzesWith)
  })
})
