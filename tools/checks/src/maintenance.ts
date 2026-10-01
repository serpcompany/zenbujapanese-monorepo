import { lineLimit, nearLimitLines } from './sizes'

export interface DocReferences {
  doc: string
  references: readonly string[]
}

export interface StaleDoc {
  doc: string
  changed: string[]
}

export interface SizeExceptionRow {
  path: string
  lines: number
}

export interface MaintenanceFacts {
  date: string
  checks: { name: string; problems: string[] }[]
  staleDocs: StaleDoc[]
  debtRows: number
  sizeExceptions: SizeExceptionRow[]
  nearLimit: SizeExceptionRow[]
  qualityChanged: string | null
  codeCommitsSinceQuality: number
}

export function lastChangeTimes(log: string): Map<string, number> {
  const times = new Map<string, number>()
  for (const record of log.split('\0')) {
    const [time, ...paths] = record.split('\n').filter(Boolean)
    const seconds = Number(time)
    if (!Number.isFinite(seconds)) continue
    for (const path of paths) if (!times.has(path)) times.set(path, seconds)
  }
  return times
}

export function docsToReverify(
  docs: readonly DocReferences[],
  times: ReadonlyMap<string, number>
): StaleDoc[] {
  return docs
    .flatMap(({ doc, references }) => {
      const docTime = times.get(doc)
      if (docTime === undefined) return []
      const changed = references.filter(reference => (times.get(reference) ?? 0) > docTime)
      return changed.length ? [{ doc, changed }] : []
    })
    .sort((a, b) => b.changed.length - a.changed.length || a.doc.localeCompare(b.doc))
}

const code = (text: string) => `\`${text}\``

export const problemsShownPerCheck = 50

function listed(items: readonly string[], limit: number): string {
  const shown = items.slice(0, limit).map(code).join(', ')
  return items.length > limit ? `${shown}, +${items.length - limit} more` : shown
}

function failure(name: string, problems: readonly string[]): string {
  const shown = problems.slice(0, problemsShownPerCheck).join('\n')
  const more = problems.length - problemsShownPerCheck
  const rest = more > 0 ? `\n\n${more} more: run ${code(`pnpm verify ${name}`)} for every one.` : ''
  return `${code(`pnpm verify ${name}`)} fails:\n\n\`\`\`text\n${shown}\n\`\`\`${rest}`
}

export function renderReport(facts: MaintenanceFacts): string {
  const failing = facts.checks.filter(check => check.problems.length)
  const sections = [
    '## Checks',
    failing.length
      ? failing.map(check => failure(check.name, check.problems)).join('\n\n')
      : `Passing: ${facts.checks.map(check => check.name).join(', ')}.`,
    '## Docs to re-verify',
    'Files these docs name or link changed after the doc was last edited. Check that each doc still matches them.',
    facts.staleDocs.length
      ? facts.staleDocs
          .map(({ doc, changed }) => `- ${code(doc)}: ${listed(changed, 5)}`)
          .join('\n')
      : 'None.',
    '## Known debt',
    [
      `- ${code('docs/tech-debt.md')}: ${facts.debtRows} open items.`,
      `- Files over the size limit, each with its reason in ${code('tools/checks/src/sizes.ts')}: ${facts.sizeExceptions.length}.`,
      ...facts.sizeExceptions.map(({ path, lines }) => `  - ${code(path)}: ${lines} lines`)
    ].join('\n'),
    '## Files near the size limit',
    `${facts.nearLimit.length} code files have ${nearLimitLines} lines or more. Every one stops at ${lineLimit}, and only the files above may pass it: split one of these by responsibility before a change has to.`,
    facts.nearLimit.length
      ? facts.nearLimit.map(({ path, lines }) => `- ${code(path)}: ${lines} lines`).join('\n')
      : 'None.',
    '## Quality grades',
    facts.qualityChanged
      ? `${code('docs/quality.md')} last changed ${facts.qualityChanged}; ${facts.codeCommitsSinceQuality} commits have changed code since.`
      : `${code('docs/quality.md')} has no history.`,
    "## This week's checklist",
    [
      '- [ ] Fix any failing check, and re-verify the docs listed above against the code.',
      `- [ ] Pay down one item from ${code('docs/tech-debt.md')}, or split one file near the size limit, in a small pull request.`,
      `- [ ] Re-grade an area in ${code('docs/quality.md')} whose tests, CI, or docs changed.`,
      `- [ ] If a failure pattern keeps coming up in reviews, add it to ${code('docs/agents/code.md')} and, where possible, a check.`
    ].join('\n')
  ]
  return `# Repository maintenance report\n\nGenerated ${facts.date} by ${code('pnpm maintenance:report')}.\n\n${sections.join('\n\n')}\n`
}
