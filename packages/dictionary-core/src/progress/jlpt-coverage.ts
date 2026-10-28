import type { JlptLevelWords } from '../artifact/browse-ranked'

export interface JlptCoverageRequest {
  known: readonly string[]
  learning: readonly string[]
  goal: number
  today: string
  upNext?: number
}

export interface JlptPace {
  date: string
  days: number
}

export interface JlptLevelCoverage {
  level: number
  name: string
  words: number
  known: number
  learning: number
  notStarted: number
  percentKnown: number
  upNext: string[]
  pace: JlptPace | null
}

const dayLength = 86_400_000

const calendarDayPattern = /^(\d{4})-(\d{2})-(\d{2})$/

const calendarDayOf = (time: number) => new Date(time).toISOString().slice(0, 10)

function dayNumber(day: string): number {
  const parts = calendarDayPattern.exec(day)
  const time = parts
    ? Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : Number.NaN
  if (Number.isNaN(time) || calendarDayOf(time) !== day) {
    throw new Error(`${day} is not a calendar day written as YYYY-MM-DD`)
  }
  return time / dayLength
}

function wholeNumberFromOne(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`The ${name} must be a whole number from 1`)
  }
  return value
}

function pace(notStarted: number, goal: number, today: number): JlptPace | null {
  if (notStarted === 0) return null
  const days = Math.ceil(notStarted / goal)
  return { date: calendarDayOf((today + days) * dayLength), days }
}

export function jlptCoverage(
  levels: readonly JlptLevelWords[],
  request: JlptCoverageRequest
): JlptLevelCoverage[] {
  const goal = wholeNumberFromOne(request.goal, 'goal')
  const upNextCount =
    request.upNext === undefined ? goal : wholeNumberFromOne(request.upNext, 'Up next count')
  const today = dayNumber(request.today)
  const known = new Set(request.known.map(id => id.toLowerCase()))
  const learning = new Set(request.learning.map(id => id.toLowerCase()))
  return levels.map(({ level, ids }) => {
    let knownCount = 0
    let learningCount = 0
    const upNext: string[] = []
    for (const id of ids) {
      if (known.has(id)) knownCount++
      else if (learning.has(id)) learningCount++
      else if (upNext.length < upNextCount) upNext.push(id)
    }
    const notStarted = ids.length - knownCount - learningCount
    return {
      level,
      name: `N${level}`,
      words: ids.length,
      known: knownCount,
      learning: learningCount,
      notStarted,
      percentKnown: ids.length === 0 ? 0 : Math.floor((knownCount * 100) / ids.length),
      upNext,
      pace: pace(notStarted, goal, today)
    }
  })
}
