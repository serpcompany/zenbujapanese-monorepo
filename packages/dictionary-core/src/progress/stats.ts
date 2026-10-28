export interface ProgressChange {
  id: string
  before: string
  after: string
  at: number
}

export interface ProgressDay {
  changes: readonly ProgressChange[]
  goal: number
  known: number
  learning: number
}

interface ProgressRequest {
  days: Readonly<Record<string, ProgressDay>>
  goal: number
  today: string
}

interface DayProgress {
  day: string
  added: number
  markedKnown: number
  goal: number
  met: boolean
}

interface DayWords {
  day: string
  addedToLearning: string[]
  markedKnown: string[]
}

interface Streak {
  length: number
  first: string
  last: string
}

interface ProgressStats {
  today: DayProgress
  days: DayProgress[]
  streak: number
  bestStreak: Streak | null
  last7: DayProgress[]
  last30: DayProgress[]
  totals: { known: number; learning: number; markedKnownLast7: number; addedLast7: number }
  knownOverTime: { day: string; known: number }[]
  dailyAverage: { average: number; days: number }
  words: DayWords[]
}

const unknown = 'unknown'
const learning = 'learning'
const known = 'known'
const kanjiPrefix = 'kanji:'
const dayLength = 86_400_000
const averagedDays = 7
const shortWindow = 7
const longWindow = 30

const dayNumber = (day: string) => {
  const [year, month, date] = day.split('-').map(Number)
  return Math.round(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1) / dayLength)
}

const dayName = (number: number) => new Date(number * dayLength).toISOString().slice(0, 10)

export const isDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day)

function addedToLearning(changes: readonly ProgressChange[]): string[] {
  const added = new Map<string, boolean>()
  for (const change of changes) {
    if (change.id.startsWith(kanjiPrefix)) continue
    if (change.before === unknown && change.after === learning) added.set(change.id, true)
    else if (change.after === unknown && added.has(change.id)) added.set(change.id, false)
  }
  return [...added].filter(([, counts]) => counts).map(([id]) => id)
}

function markedKnown(changes: readonly ProgressChange[]): string[] {
  return [...new Set(changes.filter(change => change.after === known).map(change => change.id))]
}

const sum = (days: readonly DayProgress[], count: (day: DayProgress) => number) =>
  days.reduce((total, day) => total + count(day), 0)

const extended = (run: Streak | undefined, day: string): Streak => ({
  length: (run?.length ?? 0) + 1,
  first: run?.first ?? day,
  last: day
})

function bestStreak(days: readonly DayProgress[]): Streak | null {
  let best: Streak | undefined
  let run: Streak | undefined
  for (const day of days) {
    run = day.met ? extended(run, day.day) : undefined
    if (run && run.length >= (best?.length ?? 1)) best = run
  }
  return best ?? null
}

function currentStreak(days: readonly DayProgress[]): number {
  const ended = days.at(-1)?.met ? days : days.slice(0, -1)
  let length = 0
  for (let index = ended.length - 1; index >= 0 && ended[index]?.met; index -= 1) length += 1
  return length
}

function loggedDays(request: ProgressRequest): string[] {
  const today = dayNumber(request.today)
  const logged = Object.keys(request.days)
    .filter(day => isDay(day) && dayNumber(day) <= today)
    .map(dayNumber)
  const first = Math.min(today, ...logged)
  return Array.from({ length: today - first + 1 }, (_, index) => dayName(first + index))
}

export function progressStats(request: ProgressRequest): ProgressStats {
  const range = loggedDays(request)
  const firstGoal = range.map(day => request.days[day]?.goal).find(goal => goal !== undefined)
  let goal = firstGoal ?? request.goal
  let totals = { known: 0, learning: 0 }
  const days: DayProgress[] = []
  const knownOverTime: { day: string; known: number }[] = []
  const words: DayWords[] = []
  for (const day of range) {
    const logged = request.days[day]
    goal = day === request.today ? request.goal : (logged?.goal ?? goal)
    totals = logged ? { known: logged.known, learning: logged.learning } : totals
    const changes = logged?.changes ?? []
    const added = addedToLearning(changes)
    const knownNow = markedKnown(changes)
    days.push({
      day,
      added: added.length,
      markedKnown: knownNow.length,
      goal,
      met: added.length >= goal
    })
    knownOverTime.push({ day, known: totals.known })
    if (changes.length > 0) words.push({ day, addedToLearning: added, markedKnown: knownNow })
  }
  const today = days.at(-1) as DayProgress
  const last7 = days.slice(-shortWindow)
  const averaged = days.slice(0, -1).slice(-averagedDays)
  return {
    today,
    days,
    streak: currentStreak(days),
    bestStreak: bestStreak(days),
    last7,
    last30: days.slice(-longWindow),
    totals: {
      ...totals,
      markedKnownLast7: sum(last7, day => day.markedKnown),
      addedLast7: sum(last7, day => day.added)
    },
    knownOverTime,
    dailyAverage: {
      average: averaged.length === 0 ? 0 : sum(averaged, day => day.added) / averaged.length,
      days: averaged.length
    },
    words
  }
}
