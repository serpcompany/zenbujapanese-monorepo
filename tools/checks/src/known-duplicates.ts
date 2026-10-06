import { type Duplicate, describeDuplicate } from './duplicates'

export interface DuplicateException {
  blocks: number
  reason: string
}

export const knownDuplicates: Readonly<Record<string, DuplicateException>> = {}

const pairOf = ({ first, second }: Duplicate) =>
  [first.name, second.name].sort((left, right) => left.localeCompare(right)).join(' and ')

export function duplicateProblems(
  found: readonly Duplicate[],
  checked: readonly string[],
  known: Readonly<Record<string, DuplicateException>> = knownDuplicates
): string[] {
  const inRun = new Set(checked)
  const problems: string[] = []
  const counts = new Map<string, number>()
  for (const duplicate of found) {
    const pair = pairOf(duplicate)
    counts.set(pair, (counts.get(pair) ?? 0) + 1)
    if (!known[pair]) problems.push(describeDuplicate(duplicate))
  }
  for (const [pair, { blocks, reason }] of Object.entries(known)) {
    if (!pair.split(' and ').every(path => inRun.has(path))) continue
    const count = counts.get(pair) ?? 0
    if (!reason.trim()) problems.push(`${pair}  are excepted without a reason`)
    else if (count > blocks) {
      problems.push(
        ...found.filter(duplicate => pairOf(duplicate) === pair).map(describeDuplicate),
        `${pair}  repeat ${count} blocks, more than the ${blocks} knownDuplicates allows`
      )
    } else if (count === 0) {
      problems.push(`${pair}  no longer repeat each other: remove them from knownDuplicates`)
    } else if (count < blocks) {
      problems.push(`${pair}  repeat ${count} blocks now: lower knownDuplicates to ${count}`)
    }
  }
  return problems
}
