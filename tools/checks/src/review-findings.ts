export interface ReviewFinding {
  path: string
  body: string
  url: string
  pull: number
}

export interface FindingGroup {
  area: string
  findings: number
  pulls: number
  blocking: number
  examples: { title: string; url: string }[]
}

export const repeated = { findings: 3, pulls: 2 }
const examplesShown = 3
const titleLength = 100
const nested = new Set(['apps', 'packages', 'tools', 'docs', '.github', '.claude'])

export function areaOf(path: string): string {
  const [first, second] = path.split('/')
  return second && nested.has(first) ? `${first}/${second.replace(/\.[a-z]+$/, '')}` : first
}

export function titleOf(body: string): string {
  const line = (body.split('\n').find(text => text.trim()) ?? '')
    .replace(/\*\*/g, '')
    .replace(/[[\]]/g, '')
    .replace(/^(blocking|suggestion)\b[\s:.,-]*/i, '')
    .trim()
  return line.length > titleLength ? `${line.slice(0, titleLength - 1)}…` : line
}

const isBlocking = (body: string) => /^\W*blocking\b/i.test(body)

export function readFindings(json: unknown): ReviewFinding[] {
  if (!Array.isArray(json)) return []
  return json.filter(
    (item): item is ReviewFinding =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as ReviewFinding).path === 'string' &&
      typeof (item as ReviewFinding).body === 'string' &&
      typeof (item as ReviewFinding).url === 'string' &&
      Number.isInteger((item as ReviewFinding).pull)
  )
}

export function groupFindings(findings: readonly ReviewFinding[]): FindingGroup[] {
  const areas = new Map<string, ReviewFinding[]>()
  for (const finding of findings) {
    const area = areaOf(finding.path)
    areas.set(area, [...(areas.get(area) ?? []), finding])
  }
  return [...areas]
    .map(([area, found]) => ({
      area,
      findings: found.length,
      pulls: new Set(found.map(finding => finding.pull)).size,
      blocking: found.filter(finding => isBlocking(finding.body)).length,
      examples: found
        .slice(0, examplesShown)
        .map(finding => ({ title: titleOf(finding.body), url: finding.url }))
    }))
    .sort((a, b) => b.pulls - a.pulls || b.findings - a.findings || a.area.localeCompare(b.area))
}

export const isRepeated = (group: FindingGroup) =>
  group.findings >= repeated.findings && group.pulls >= repeated.pulls
