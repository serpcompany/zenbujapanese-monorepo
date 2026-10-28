import { isDay, type ProgressChange, type ProgressDay } from './stats'

export interface DatedChange extends ProgressChange {
  day: string
}

interface Totals {
  known: number
  learning: number
}

interface DaysRequest {
  days: Readonly<Record<string, ProgressDay>>
  changes: readonly DatedChange[]
  goal: number
  today: string
  totals: Totals
}

const sameMoment = 1

const counts = (status: string, counted: string) => (status === counted ? 1 : 0)

const moved = (totals: Totals, change: ProgressChange, sign = 1): Totals => ({
  known: totals.known + sign * (counts(change.after, 'known') - counts(change.before, 'known')),
  learning:
    totals.learning + sign * (counts(change.after, 'learning') - counts(change.before, 'learning'))
})

const recordedKey = (change: ProgressChange) => `${change.id} ${change.after}`

function recordedTimes(days: readonly ProgressDay[]): Map<string, number[]> {
  const times = new Map<string, number[]>()
  for (const change of days.flatMap(day => day.changes)) {
    const key = recordedKey(change)
    times.set(key, [...(times.get(key) ?? []), change.at])
  }
  return times
}

function newChanges(request: DaysRequest, logged: readonly string[]): DatedChange[] {
  const recorded = recordedTimes(logged.map(day => request.days[day] as ProgressDay))
  return request.changes.filter(
    change =>
      isDay(change.day) &&
      change.day < request.today &&
      Number.isFinite(change.at) &&
      !(recorded.get(recordedKey(change)) ?? []).some(at => Math.abs(at - change.at) < sameMoment)
  )
}

const undated = ({ day: _day, ...change }: DatedChange): ProgressChange => change

function dayChanges(own: ProgressDay | undefined, added: readonly DatedChange[]) {
  const changes = own?.changes ?? []
  if (added.length === 0) return changes
  return [...changes, ...added.map(undated)].sort((first, second) => first.at - second.at)
}

export function progressDays(request: DaysRequest): Record<string, ProgressDay> {
  const logged = Object.keys(request.days).filter(isDay).sort()
  const changes = newChanges(request, logged)
  const recorded = logged.flatMap(day => request.days[day]?.changes ?? [])
  const base = [...recorded, ...changes].reduce(
    (totals, change) => moved(totals, change, -1),
    request.totals
  )
  const days = [...new Set(changes.map(change => change.day))].sort()
  const first = days[0] ?? request.today
  const affected = [
    ...new Set([...days, ...logged.filter(day => day >= first && day < request.today)])
  ].sort()
  const filled: Record<string, ProgressDay> = {}
  let movedSoFar: Totals = { known: 0, learning: 0 }
  for (const day of affected) {
    const added = changes.filter(change => change.day === day)
    movedSoFar = added.reduce((totals, change) => moved(totals, change), movedSoFar)
    const own = request.days[day]
    const earlierDay = logged.filter(earlier => earlier < day).at(-1)
    const anchor = own ?? (earlierDay === undefined ? undefined : request.days[earlierDay])
    const start = anchor ? { known: anchor.known, learning: anchor.learning } : base
    const known = Math.max(0, start.known + movedSoFar.known)
    const learning = Math.max(0, start.learning + movedSoFar.learning)
    if (own && added.length === 0 && own.known === known && own.learning === learning) continue
    filled[day] = {
      changes: dayChanges(own, added),
      goal: anchor?.goal ?? request.goal,
      known,
      learning
    }
  }
  return filled
}
