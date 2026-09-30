import type { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { beforeAll, describe, expect, test } from 'vitest'
import { artifactAvailable, dictionary } from './support'

// The service runs the app's FTS4 queries on the artifact's own FTS4 indexes, so English search
// matches what the app matches, including where FTS4's Porter stemmer differs from other full-text
// engines: the FTS5 copy the website searched before the service (ADR 0009) missed these. No
// app-recorded case covers them.

describe.runIf(artifactAvailable)('full-text search as the app runs it', () => {
  let service: Dictionary

  beforeAll(async () => {
    service = await dictionary({ morphology: false })
  })

  test('a long number finds glosses, as FTS4 stems it', async () => {
    const { screen } = await service.search('9999999')
    expect(screen.state).toBe('results')
    if (screen.state !== 'results') return
    expect(screen.rows.map(row => row.headword)).toEqual(
      expect.arrayContaining(['テンナイン', 'イレブンナイン'])
    )
  })

  test('a stray double quote finds nothing, rather than failing', async () => {
    const { screen } = await service.search('eat"')
    expect(screen.state).toBe('noResults')
    expect(await service.searchExamples('eat"')).toBeNull()
  })
})
