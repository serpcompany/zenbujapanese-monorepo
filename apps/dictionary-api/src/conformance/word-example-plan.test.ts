import type { SqlValue } from '@zenbu/dictionary-core/artifact/database'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, artifactDatabase, dictionary } from './support'

const taberu = 1358280

interface PlannedStatement {
  sql: string
  steps: string[]
}

describe.runIf(artifactAvailable)("a word page's examples on the artifact", () => {
  let planned: PlannedStatement[]

  beforeAll(async () => {
    const db = await artifactDatabase()
    planned = []
    const plan = (sql: string, params: readonly SqlValue[]) => {
      if (!/\bforms\b/.test(sql)) return
      const steps = db.all<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, params)
      planned.push({ sql, steps: steps.map(step => step.detail) })
    }
    const service = await dictionary({ morphology: false, watch: plan })
    expect(service.word(taberu)?.rows.examples.length).toBeGreaterThan(0)
  })

  test("read the entry's forms through the forms index on entry_id", () => {
    const byEntry = planned.filter(({ sql }) => sql.includes('f.entry_id = e.id'))
    expect(byEntry.length).toBeGreaterThan(0)
    for (const { steps } of byEntry) {
      expect(steps).toContain('SEARCH f USING INDEX forms_entry_id_index (entry_id=?)')
    }
  })

  test('never scan every form', () => {
    const scans = planned.flatMap(({ steps }) => steps.filter(step => step.startsWith('SCAN ')))
    expect(scans).toEqual([])
  })
})
