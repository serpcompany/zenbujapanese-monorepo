const daySeconds = 24 * 60 * 60

export interface MarkdownTable {
  heading: string
  header: string[]
  rows: string[][]
}

const cellsOf = (line: string): string[] =>
  line
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim())

export function markdownTables(text: string): MarkdownTable[] {
  const tables: MarkdownTable[] = []
  let heading = ''
  let current: MarkdownTable | null = null
  for (const line of text.split('\n')) {
    const title = /^#+\s+(.*)$/.exec(line)?.[1]
    if (title !== undefined) heading = title.trim()
    if (!line.startsWith('|')) {
      current = null
      continue
    }
    if (/^\|\s*:?-/.test(line)) continue
    if (current === null) {
      current = { heading, header: cellsOf(line), rows: [] }
      tables.push(current)
    } else {
      current.rows.push(cellsOf(line))
    }
  }
  return tables
}

const codeSpans = (cell: string): string[] =>
  [...cell.matchAll(/`([^`]+)`/g)].map(match => match[1])

export function lastChange(times: ReadonlyMap<string, number>, path: string): number | undefined {
  const exact = times.get(path)
  if (exact !== undefined) return exact
  const folder = `${path.replace(/\/$/, '')}/`
  let newest: number | undefined
  for (const [file, time] of times) {
    if (file.startsWith(folder) && (newest === undefined || time > newest)) newest = time
  }
  return newest
}

interface ScoreToRegrade {
  area: string
  graded: string
  changed: { path: string; day: string }[]
}

export interface QualityRows {
  stale: ScoreToRegrade[]
  ungraded: string[]
}

const dayOf = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10)

export function scoresToRegrade(text: string, times: ReadonlyMap<string, number>): QualityRows {
  const stale: ScoreToRegrade[] = []
  const ungraded: string[] = []
  for (const { header, rows } of markdownTables(text)) {
    const code = header.indexOf('Code')
    const graded = header.indexOf('Graded')
    if (code === -1 || graded === -1) continue
    for (const row of rows) {
      const area = row[0] ?? ''
      const gradedOn = row[graded] ?? ''
      const gradedDayEnd = Date.parse(`${gradedOn}T00:00:00Z`) / 1000 + daySeconds
      if (!/^\d{4}-\d{2}-\d{2}$/.test(gradedOn) || Number.isNaN(gradedDayEnd)) {
        ungraded.push(area)
        continue
      }
      const changed = codeSpans(row[code] ?? '').flatMap(path => {
        const time = lastChange(times, path)
        return time !== undefined && time >= gradedDayEnd ? [{ path, day: dayOf(time) }] : []
      })
      if (changed.length) stale.push({ area, graded: gradedOn, changed })
    }
  }
  return { stale, ungraded }
}

const sizes = ['small', 'medium', 'large'] as const
type Size = (typeof sizes)[number]
const isSize = (value: string): value is Size => sizes.some(size => size === value)

export interface DebtItem {
  section: string
  debt: string
  issue: string
}

export interface DebtSummary {
  open: number
  bySize: Record<Size, number>
  firstSmall: DebtItem | null
  unsized: DebtItem[]
}

export function firstSentence(text: string): string {
  let insideCode = false
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '`') insideCode = !insideCode
    const ends = text[index] === '.' && (index === text.length - 1 || text[index + 1] === ' ')
    if (ends && !insideCode) return text.slice(0, index + 1)
  }
  return text
}

export function summarizeDebt(text: string): DebtSummary {
  const rows = markdownTables(text).flatMap(({ heading, header, rows: tableRows }) => {
    if (header[0] !== 'Debt') return []
    const size = header.indexOf('Size')
    const issue = header.indexOf('Issue')
    return tableRows.map(row => ({
      size: size === -1 ? '' : (row[size] ?? ''),
      item: { section: heading, debt: firstSentence(row[0] ?? ''), issue: row[issue] ?? '' }
    }))
  })
  const bySize: Record<Size, number> = { small: 0, medium: 0, large: 0 }
  for (const row of rows) if (isSize(row.size)) bySize[row.size] += 1
  return {
    open: rows.length,
    bySize,
    firstSmall: rows.find(row => row.size === 'small')?.item ?? null,
    unsized: rows.filter(row => !isSize(row.size)).map(row => row.item)
  }
}
