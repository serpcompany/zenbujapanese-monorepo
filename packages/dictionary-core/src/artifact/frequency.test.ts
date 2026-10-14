import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, test, vi } from 'vitest'
import type { FrequencyDictionary } from '../detail/frequency'
import { fakeDictionary } from '../embedded/fake-host'
import { type EmbeddedHost, type HostRows, hostFrequency } from '../embedded/host'
import type { ArtifactDatabase, SqlValue } from './database'
import {
  bundledFrequency,
  type FrequencyList,
  type ReadableFrequencyList,
  readFrequency
} from './frequency'

const entry = (number: number) => number.toString(16).padStart(32, '0')
const [meet, eat, cat, unlisted] = [1, 2, 3, 4].map(entry)

const jlpt = fakeDictionary('zenbu.jlpt.waller.levels', 'JLPT Levels', 'level')
const youTube = fakeDictionary('zenbu.tubelex.youtube.ja.unidic-3.1', 'YouTube')
const anime = fakeDictionary('zenbu.jiten.anime.ja.ordered-v2', 'Anime')

const levels = { [meet]: 5, [eat]: 4 }
const ranks = { [meet]: 120, [cat]: 9_000 }
const animeRanks = { [eat]: 7 }

const tables = {
  level: `level_evidence (
    language_reference_id BLOB PRIMARY KEY,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5)
  ) WITHOUT ROWID`,
  rank: `frequency_evidence (
    language_reference_id BLOB PRIMARY KEY, rank INTEGER NOT NULL,
    source_count INTEGER NOT NULL DEFAULT 0, mapping_relation TEXT NOT NULL DEFAULT 'exactReading'
  ) WITHOUT ROWID`
}

const folder = mkdtempSync(join(tmpdir(), 'zenbu-frequency-lists-'))
const opened: DatabaseSync[] = []

afterAll(() => {
  for (const database of opened) database.close()
  rmSync(folder, { recursive: true, force: true })
})

function open(path: string): DatabaseSync {
  const database = new DatabaseSync(path)
  opened.push(database)
  return database
}

function write(
  database: DatabaseSync,
  kind: FrequencyDictionary['kind'],
  values: Readonly<Record<string, number>>,
  schema = 'main'
): void {
  database.exec(`CREATE TABLE ${schema}.${tables[kind]}`)
  const table = kind === 'level' ? 'level_evidence' : 'frequency_evidence'
  const insert = database.prepare(
    `INSERT INTO ${schema}.${table} (language_reference_id, ${kind}) VALUES (unhex(?), ?)`
  )
  for (const [id, value] of Object.entries(values)) insert.run(id, value)
}

function file(kind: FrequencyDictionary['kind'], values: Readonly<Record<string, number>>): string {
  const path = join(folder, `${opened.length}.sqlite3`)
  write(open(path), kind, values)
  return path
}

function reading(database: DatabaseSync): ArtifactDatabase & { asked: string[] } {
  const asked: string[] = []
  return {
    asked,
    all<Row>(sql: string, params: readonly SqlValue[] = []) {
      asked.push(sql)
      return database.prepare(sql).all(...params) as Row[]
    }
  }
}

function ownFile(
  described: FrequencyDictionary,
  values: Readonly<Record<string, number>>
): ReadableFrequencyList & { asked: string[] } {
  const database = reading(open(file(described.kind, values)))
  return {
    dictionary: described,
    asked: database.asked,
    rows: (sql, params) => database.all(sql, params)
  }
}

function attached(): ArtifactDatabase & { asked: string[] } {
  const database = open(':memory:')
  database.exec(`ATTACH DATABASE '${file('level', levels)}' AS jlpt`)
  database.exec(`ATTACH DATABASE '${file('rank', ranks)}' AS tubelex`)
  return reading(database)
}

describe('readFrequency', () => {
  test('reads each list’s own file in the order given: a level list’s levels, a rank list’s ranks', () => {
    const lists = [ownFile(jlpt, levels), ownFile(youTube, ranks), ownFile(anime, animeRanks)]
    expect(readFrequency(lists, [meet, eat, cat])).toEqual({
      dictionaries: [jlpt, youTube, anime],
      entries: {
        [meet]: [
          { dictionary: 0, value: 5 },
          { dictionary: 1, value: 120 },
          { dictionary: 2, value: null }
        ],
        [eat]: [
          { dictionary: 0, value: 4 },
          { dictionary: 1, value: null },
          { dictionary: 2, value: 7 }
        ],
        [cat]: [
          { dictionary: 0, value: null },
          { dictionary: 1, value: 9_000 },
          { dictionary: 2, value: null }
        ]
      }
    })
  })

  test('reads a list attached to another database under its schema, as it reads the list’s own file', () => {
    const database = attached()
    const rows: ReadableFrequencyList['rows'] = (sql, params) => database.all(sql, params)
    const underSchemas = readFrequency(
      [
        { dictionary: jlpt, schema: 'jlpt', rows },
        { dictionary: youTube, schema: 'tubelex', rows }
      ],
      [meet, eat, cat, unlisted]
    )
    expect(underSchemas).toEqual(
      readFrequency([ownFile(jlpt, levels), ownFile(youTube, ranks)], [meet, eat, cat, unlisted])
    )
    expect(underSchemas.entries[meet]).toEqual([
      { dictionary: 0, value: 5 },
      { dictionary: 1, value: 120 }
    ])
    expect(database.asked.map(sql => /FROM (\S+)/.exec(sql)?.[1])).toEqual([
      'jlpt.level_evidence',
      'tubelex.frequency_evidence'
    ])
  })

  test('answers null for an entry a list does not hold, and for what is no entry’s ID', () => {
    const evidence = readFrequency(
      [ownFile(jlpt, levels), ownFile(youTube, ranks)],
      [unlisted, 'zz', '', 'constructor']
    )
    const nothing = [
      { dictionary: 0, value: null },
      { dictionary: 1, value: null }
    ]
    expect(evidence.entries).toEqual({
      [unlisted]: nothing,
      zz: nothing,
      '': nothing,
      constructor: nothing
    })
  })

  test('names a list that cannot be read with its reason, and still reads the others', () => {
    const lists: FrequencyList[] = [
      { dictionary: jlpt, unavailable: 'Pack unavailable' },
      ownFile(youTube, ranks)
    ]
    expect(readFrequency(lists, [meet, eat])).toEqual({
      dictionaries: [jlpt, youTube],
      entries: {
        [meet]: [
          { dictionary: 0, unavailable: 'Pack unavailable' },
          { dictionary: 1, value: 120 }
        ],
        [eat]: [
          { dictionary: 0, unavailable: 'Pack unavailable' },
          { dictionary: 1, value: null }
        ]
      }
    })
  })

  test('says so for every entry when no list can be read at all', () => {
    const reason = 'Bundled frequency data unavailable'
    expect(readFrequency([{ dictionary: null, unavailable: reason }], [meet, eat])).toEqual({
      dictionaries: [],
      entries: {
        [meet]: [{ dictionary: null, unavailable: reason }],
        [eat]: [{ dictionary: null, unavailable: reason }]
      }
    })
  })

  test.each([
    ['whose read fails', () => null],
    ['that answers a value that is no number', () => [{ id: meet, value: 'N5' }]],
    ['that answers a value that is no whole number', () => [{ id: meet, value: 1.5 }]],
    ['that answers a row without its entry', () => [{ value: 5 }]]
  ])('calls a list %s unavailable, and still reads the others', (_, rows) => {
    const evidence = readFrequency([{ dictionary: jlpt, rows }, ownFile(youTube, ranks)], [meet])
    expect(evidence.dictionaries).toEqual([jlpt, youTube])
    expect(evidence.entries[meet]).toEqual([
      { dictionary: 0, unavailable: 'Frequency data unavailable' },
      { dictionary: 1, value: 120 }
    ])
  })

  test('keeps the learner’s order, whatever the number of lists', () => {
    const others = Array.from({ length: 7 }, (_, index) =>
      ownFile(fakeDictionary(`zenbu.fixture.list-${index}.ja`, `List ${index}`), {
        [meet]: 100 + index,
        ...(index % 2 === 0 ? { [eat]: 200 + index } : {})
      })
    )
    const nine = [
      others[2],
      others[1],
      others[0],
      ownFile(jlpt, levels),
      others[6],
      others[5],
      others[4],
      ownFile(youTube, ranks),
      others[3]
    ]
    const evidence = readFrequency(nine, [eat, meet])
    expect(evidence.dictionaries.map(listed => listed.name)).toEqual([
      'List 2',
      'List 1',
      'List 0',
      'JLPT Levels',
      'List 6',
      'List 5',
      'List 4',
      'YouTube',
      'List 3'
    ])
    const values = (id: string) =>
      evidence.entries[id].map(lookup => ('value' in lookup ? lookup.value : lookup.unavailable))
    expect(values(meet)).toEqual([102, 101, 100, 5, 106, 105, 104, 120, 103])
    expect(values(eat)).toEqual([202, null, 200, 4, 206, null, 204, null, null])
    expect(Object.keys(evidence.entries)).toEqual([eat, meet])
  })

  test('asks each list once for all the entries, each entry once, and nothing without entries', () => {
    const level = ownFile(jlpt, levels)
    const rank = ownFile(youTube, ranks)
    const evidence = readFrequency([level, rank], [meet, cat, meet, cat, eat])
    expect(Object.keys(evidence.entries)).toEqual([meet, cat, eat])
    expect([level.asked.length, rank.asked.length]).toEqual([1, 1])
    expect(readFrequency([level, rank], [])).toEqual({
      dictionaries: [jlpt, youTube],
      entries: {}
    })
    expect([level.asked.length, rank.asked.length]).toEqual([1, 1])
  })

  test('asks the same statement however many entries it reads, so a client prepares it once', () => {
    const rank = ownFile(youTube, ranks)
    readFrequency([rank], [meet])
    readFrequency([rank], [meet, eat, cat, unlisted])
    expect(new Set(rank.asked).size).toBe(1)
  })

  test.each([
    ['a level list', jlpt, levels],
    ['a rank list', youTube, ranks]
  ])('looks entries up in %s by its primary key, never by scanning it', (_, described, values) => {
    const database = open(file(described.kind, values))
    const plan: string[] = []
    readFrequency(
      [
        {
          dictionary: described,
          rows(sql, params) {
            const steps = database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params)
            plan.push(...steps.map(step => String(step.detail)))
            return []
          }
        }
      ],
      [meet, eat]
    )
    const table = described.kind === 'level' ? 'level_evidence' : 'frequency_evidence'
    expect(plan).toContain(`SEARCH ${table} USING PRIMARY KEY (language_reference_id=?)`)
    expect(plan.filter(step => step.startsWith(`SCAN ${table}`))).toEqual([])
  })

  test('reads what an embedded host answers for each of its lists, as the app hands them over', () => {
    const files = new Map([
      [jlpt.id, reading(open(file('level', levels)))],
      [youTube.id, reading(open(file('rank', ranks)))]
    ])
    const host: EmbeddedHost = {
      frequencyLists: () => ({ lists: [{ dictionary: jlpt }, { dictionary: youTube }] }),
      frequencyListRows(list, sql, parametersJSON): HostRows {
        const database = files.get(list)
        if (!database) return { error: `no list ${list}` }
        return { rows: database.all(sql, JSON.parse(parametersJSON) as SqlValue[]), blobs: [] }
      }
    }
    expect(hostFrequency(host, [meet, cat])).toEqual(
      readFrequency([ownFile(jlpt, levels), ownFile(youTube, ranks)], [meet, cat])
    )
  })
})

describe('bundledFrequency', () => {
  test('gives each entry its JLPT level, then its YouTube rank, and nothing for an entry neither lists', () => {
    expect(bundledFrequency(attached(), [cat, meet, unlisted, eat])).toEqual(
      new Map([
        [cat, [{ pack: 'tubelex', rank: 9_000 }]],
        [
          meet,
          [
            { pack: 'jlpt', level: 5 },
            { pack: 'tubelex', rank: 120 }
          ]
        ],
        [eat, [{ pack: 'jlpt', level: 4 }]]
      ])
    )
  })

  test('reads the two lists once each, and nothing without entries', () => {
    const database = attached()
    bundledFrequency(database, [meet, eat, cat])
    expect(database.asked).toHaveLength(2)
    const all = vi.fn()
    expect(bundledFrequency({ all }, [])).toEqual(new Map())
    expect(all).not.toHaveBeenCalled()
  })

  test('fails, rather than answer without it, when a list cannot be read', () => {
    const broken = open(':memory:')
    expect(() => bundledFrequency(reading(broken), [meet])).toThrow('no such table')
    const unreadable: ArtifactDatabase = { all: <Row>() => [{ id: meet, value: 'N5' }] as Row[] }
    expect(() => bundledFrequency(unreadable, [meet])).toThrow(
      'JLPT Levels: Frequency data unavailable'
    )
  })
})
