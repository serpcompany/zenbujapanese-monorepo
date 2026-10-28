import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vitest'
import { jlptLevelWords, jlptRowids } from '../artifact/browse-ranked'
import { sqliteDatabase } from '../artifact/sqlite-database'
import { embeddedEndpoint } from '../embedded/dictionary'
import { type JlptCoverageRequest, jlptCoverage } from './jlpt-coverage'

const word = (id: string, entSeq: number, reading: string, level: number | null) => ({
  id,
  entSeq,
  reading,
  level
})

const taberu = word('042e07f7052f611fed33ddddf37f55fd', 1358280, 'たべる', 5)
const au = word('5a238575a0b37a31bff65148e1092c72', 1198180, 'あう', 5)
const miru = word('7f490a9c9c0da94f4e9474f4efe74be1', 1259290, 'みる', 5)
const aoi = word('4ad52925f10de4f47d9672c0c0125ea6', 1381390, 'あおい', 5)
const ao = word('cb0f7ec7f12782023d6481864ebea362', 1381380, 'あお', 5)
const keizai = word('afe76408deda0234b7e9b4cc5e8ce0ec', 1251320, 'けいざい', 4)
const isogu = word('1185f08c917f55f8262b3c998b409db3', 1228650, 'いそぐ', 4)
const giron = word('331e05da8ac9240c6df34dda5d3e4f3d', 1226160, 'ぎろん', 3)
const aimai = word('860d6b622df27607df9ef46db22bd50f', 1567920, 'あいまい', 2)
const togeru = word('a1bc52ece9adbd464ad852103efad6f3', 1372620, 'とげる', 1)
const nekojita = word('ce83757afc42cd4feb1d0f7660619092', 1467670, 'ねこじた', null)

const inRowidOrder = [taberu, au, miru, aoi, ao, keizai, isogu, giron, aimai, togeru, nekojita]

function artifact(): DatabaseSync {
  const database = new DatabaseSync(':memory:')
  database.exec(`CREATE TABLE entries (
    id BLOB PRIMARY KEY, source_record_id INTEGER NOT NULL, reading TEXT NOT NULL
  )`)
  database.exec(`ATTACH DATABASE ':memory:' AS jlpt`)
  database.exec(`CREATE TABLE jlpt.level_evidence (
    language_reference_id BLOB PRIMARY KEY,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5)
  ) WITHOUT ROWID`)
  const entry = database.prepare('INSERT INTO entries VALUES (unhex(?), ?, ?)')
  const level = database.prepare('INSERT INTO jlpt.level_evidence VALUES (unhex(?), ?)')
  for (const { id, entSeq, reading, level: listed } of inRowidOrder) {
    entry.run(id, entSeq, reading)
    if (listed !== null) level.run(id, listed)
  }
  return database
}

const levels = jlptLevelWords(sqliteDatabase(artifact()))

const asked = (request: Partial<JlptCoverageRequest>): JlptCoverageRequest => ({
  known: [],
  learning: [],
  goal: 20,
  today: '2026-10-28',
  ...request
})

const coverage = (request: Partial<JlptCoverageRequest>) => jlptCoverage(levels, asked(request))

const ofLevel = (request: Partial<JlptCoverageRequest>, level: number) => {
  const found = coverage(request).find(answer => answer.level === level)
  if (!found) throw new Error(`No N${level} in the coverage`)
  return found
}

describe("each JLPT level's words", () => {
  test('are read from the level pack, N5 to N1, in the order the level’s browse page lists them', () => {
    expect(levels).toEqual([
      { level: 5, ids: [au, ao, aoi, taberu, miru].map(listed => listed.id) },
      { level: 4, ids: [isogu, keizai].map(listed => listed.id) },
      { level: 3, ids: [giron.id] },
      { level: 2, ids: [aimai.id] },
      { level: 1, ids: [togeru.id] }
    ])
    const database = sqliteDatabase(artifact())
    const idOfRow = new Map(inRowidOrder.map(({ id }, index) => [index + 1, id]))
    for (const { level, ids } of levels) {
      expect(jlptRowids(database, level).map(rowid => idOfRow.get(rowid))).toEqual(ids)
    }
  })

  test("total each level's words in the pack", () => {
    const counted = artifact()
      .prepare('SELECT level, count(*) AS words FROM jlpt.level_evidence GROUP BY level')
      .all() as { level: number; words: number }[]
    const totals = Object.fromEntries(counted.map(({ level, words }) => [level, words]))
    for (const answer of coverage({})) expect(answer.words).toBe(totals[answer.level])
  })
})

describe('JLPT coverage', () => {
  test('counts Known, Learning, and Not started words, with the percent known, N5 to N1', () => {
    const answer = coverage({ known: [au.id, miru.id, keizai.id], learning: [taberu.id, giron.id] })
    expect(answer.map(level => [level.name, level.words, level.known, level.learning])).toEqual([
      ['N5', 5, 2, 1],
      ['N4', 2, 1, 0],
      ['N3', 1, 0, 1],
      ['N2', 1, 0, 0],
      ['N1', 1, 0, 0]
    ])
    expect(answer.map(level => [level.notStarted, level.percentKnown])).toEqual([
      [2, 40],
      [1, 50],
      [0, 0],
      [1, 0],
      [1, 0]
    ])
  })

  test('rounds the percent known down, so a level shows 100% only once every word is Known', () => {
    const allButOne = [au, ao, aoi, taberu].map(listed => listed.id)
    expect(ofLevel({ known: allButOne }, 5).percentKnown).toBe(80)
    expect(ofLevel({ known: [...allButOne, miru.id] }, 5).percentKnown).toBe(100)
    expect(ofLevel({ known: [keizai.id] }, 4).percentKnown).toBe(50)
  })

  test("doesn't count a word with no level, and counts a word marked both Known and Learning once, as Known", () => {
    const answer = coverage({
      known: [nekojita.id, au.id.toUpperCase()],
      learning: [nekojita.id, au.id, '最']
    })
    expect(answer.reduce((sum, level) => sum + level.known + level.learning, 0)).toBe(1)
    expect(ofLevel({ known: [au.id], learning: [au.id] }, 5)).toMatchObject({
      known: 1,
      learning: 0,
      notStarted: 4
    })
  })

  test('lists Up next as the first Not-started words in the level’s order, as many as the goal', () => {
    expect(ofLevel({ known: [ao.id], learning: [au.id], goal: 2 }, 5).upNext).toEqual([
      aoi.id,
      taberu.id
    ])
    expect(ofLevel({ goal: 2, upNext: 4 }, 5).upNext).toEqual([au, ao, aoi, taberu].map(w => w.id))
    expect(ofLevel({ known: [togeru.id] }, 1).upNext).toEqual([])
  })

  test('paces the Not-started words at the goal, rounding up to whole days from today', () => {
    expect(ofLevel({ goal: 2, today: '2026-10-28' }, 5).pace).toEqual({
      date: '2026-10-31',
      days: 3
    })
    expect(ofLevel({ goal: 5, today: '2026-12-31' }, 5).pace).toEqual({
      date: '2027-01-01',
      days: 1
    })
    expect(ofLevel({ goal: 1, today: '2028-02-27' }, 4).pace).toEqual({
      date: '2028-02-29',
      days: 2
    })
    expect(ofLevel({ goal: 20, learning: [au.id, ao.id, aoi.id] }, 5).pace?.days).toBe(1)
  })

  test('has no pace for a level with nothing left to start', () => {
    const answer = coverage({ known: [giron.id], learning: [aimai.id, togeru.id], goal: 1 })
    expect(answer.map(level => level.pace === null)).toEqual([false, false, true, true, true])
  })

  test('asks the pace again at another goal, before the learner picks it', () => {
    const atGoals = [1, 2, 5, 10].map(goal => ofLevel({ goal }, 5).pace?.days)
    expect(atGoals).toEqual([5, 3, 1, 1])
  })

  test('refuses a goal or an Up next count that is not a whole number from 1, and a day that is not one', () => {
    for (const goal of [0, -5, 1.5, Number.NaN]) {
      expect(() => coverage({ goal })).toThrow('The goal must be a whole number from 1')
    }
    expect(() => coverage({ upNext: 0 })).toThrow('The Up next count must be a whole number')
    for (const today of ['2026-02-30', '2026-10-28T00:00', '28/10/2026']) {
      expect(() => coverage({ today })).toThrow('is not a calendar day written as YYYY-MM-DD')
    }
  })
})

describe('the embedded jlptCoverage answer', () => {
  test('answers at once from the host’s artifact and reads the levels once', () => {
    const database = artifact()
    const statements: string[] = []
    const endpoint = embeddedEndpoint({
      all(sql, parametersJSON) {
        statements.push(sql)
        const rows = database.prepare(sql).all(...JSON.parse(parametersJSON))
        return { rows: rows as Record<string, unknown>[] }
      }
    })
    const request = asked({ known: [au.id], learning: [keizai.id], goal: 3 })
    expect(endpoint.answer('jlptCoverage', JSON.stringify(request))).toEqual(
      jlptCoverage(levels, request)
    )
    const atAnotherGoal = JSON.parse(
      endpoint.answerJSON('jlptCoverage', JSON.stringify({ ...request, goal: 1 }))
    )
    expect(atAnotherGoal[0].pace).toEqual({ date: '2026-11-01', days: 4 })
    expect(statements).toHaveLength(1)
  })
})
