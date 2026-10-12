import { type FindingGroup, isRepeated, repeated } from './review-findings'
import { lineLimit, nearLimitLines } from './sizes'
import { type DebtItem, type DebtSummary, debtFiles, type QualityRows } from './work-tracking'

export interface DocReferences {
  doc: string
  references: readonly string[]
}

export interface StaleDoc {
  doc: string
  changed: string[]
}

interface SizeExceptionRow {
  path: string
  lines: number
}

export interface CheckProblems {
  name: string
  problems: string[]
}

export interface MaintenanceFacts {
  date: string
  checks: CheckProblems[]
  staleDocs: StaleDoc[]
  quality: QualityRows
  debt: DebtSummary
  sizeExceptions: SizeExceptionRow[]
  longDocs: SizeExceptionRow[]
  duplicateExceptions: { pair: string; blocks: number }[]
  nearLimit: SizeExceptionRow[]
  reviewFindings: FindingGroup[] | null
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

function limited(items: readonly string[], limit: number): string {
  const shown = items.slice(0, limit).join(', ')
  return items.length > limit ? `${shown}, +${items.length - limit} more` : shown
}

const listed = (items: readonly string[], limit: number) => limited(items.map(code), limit)

function failure(name: string, problems: readonly string[]): string {
  const shown = problems.slice(0, problemsShownPerCheck).join('\n')
  const more = problems.length - problemsShownPerCheck
  const rest = more > 0 ? `\n\n${more} more: run ${code(`pnpm verify ${name}`)} for every one.` : ''
  return `${code(`pnpm verify ${name}`)} fails:\n\n\`\`\`text\n${shown}\n\`\`\`${rest}`
}

function scoresSection(quality: QualityRows): string {
  const lines = [
    ...quality.stale.map(
      ({ area, graded, changed }) =>
        `- ${area} (graded ${graded}): ${limited(
          changed.map(({ path, day }) => `${code(path)} changed ${day}`),
          5
        )}`
    ),
    ...(quality.ungraded.length
      ? [`- Rows without a Graded date, which each need one: ${quality.ungraded.join(', ')}.`]
      : [])
  ]
  return lines.length ? lines.join('\n') : 'None.'
}

const debtItem = ({ section, debt, issue }: DebtItem) =>
  [section ? `${section}: ${debt}` : debt, issue ? `Issue: ${issue}.` : '']
    .filter(Boolean)
    .join(' ')

function debtLines(debt: DebtSummary): string[] {
  const { small, medium, large } = debt.bySize
  return [
    `- ${debtFiles.map(code).join(' and ')}: ${debt.open} open items (${small} small, ${medium} medium, ${large} large).`,
    `- First small item: ${debt.firstSmall ? debtItem(debt.firstSmall) : 'none.'}`,
    ...(debt.unsized.length
      ? [
          `- Rows without a Size, which each need one: ${debt.unsized.length}.`,
          ...debt.unsized.map(item => `  - ${debtItem(item)}`)
        ]
      : [])
  ]
}

function findingsSection(groups: FindingGroup[] | null): string {
  if (!groups) {
    return `Not collected: only the ${code('report')} job of ${code('Weekly maintenance')} reads the pull requests' comments.`
  }
  if (groups.length === 0) return 'None in the last four weeks.'
  const line = ({ area, findings, pulls, blocking, examples }: FindingGroup) =>
    `- ${code(area)}: ${findings} in ${pulls} pull request${pulls === 1 ? '' : 's'}, ${blocking} blocking. ${examples
      .map(({ title, url }) => `[${title}](${url})`)
      .join('; ')}`
  const patterns = groups.filter(isRepeated)
  const rest = groups.filter(group => !isRepeated(group))
  return [
    patterns.length ? `Repeated:\n\n${patterns.map(line).join('\n')}` : 'Nothing repeated.',
    ...(rest.length ? [`Elsewhere:\n\n${rest.map(line).join('\n')}`] : [])
  ].join('\n\n')
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
    '## Scores to re-grade',
    `Rows of ${code('docs/quality.md')} whose code changed after the day they were graded. Re-grade each against the code as it is now, and set its Graded date.`,
    scoresSection(facts.quality),
    '## Known debt',
    [
      ...debtLines(facts.debt),
      `- Files over the size limit, each with its reason in ${code('tools/checks/src/sizes.ts')}: ${facts.sizeExceptions.length}.`,
      ...facts.sizeExceptions.map(({ path, lines }) => `  - ${code(path)}: ${lines} lines`),
      `- Docs over their size budget, each with its allowance in ${code('tools/checks/src/doc-rules/budgets.ts')}: ${facts.longDocs.length}. Split one by topic, then lower or remove its allowance.`,
      ...facts.longDocs.map(({ path, lines }) => `  - ${code(path)}: ${lines} lines`),
      `- Repeated blocks allowed for now, each pair with its reason in ${code('tools/checks/src/known-duplicates.ts')}: ${facts.duplicateExceptions.reduce((total, { blocks }) => total + blocks, 0)}.`,
      ...facts.duplicateExceptions.map(({ pair, blocks }) => `  - ${pair}: ${blocks}`)
    ].join('\n'),
    '## Files near the size limit',
    `${facts.nearLimit.length} code files have ${nearLimitLines} lines or more. Every one stops at ${lineLimit}, and only the files above may pass it: split one of these by responsibility before a change has to.`,
    facts.nearLimit.length
      ? facts.nearLimit.map(({ path, lines }) => `- ${code(path)}: ${lines} lines`).join('\n')
      : 'None.',
    '## Review findings',
    `What Claude's review commented inline in the last four weeks, by the part of the repository. ${repeated.findings} or more in one part, across ${repeated.pulls} or more pull requests, is a pattern: write the rule into ${code('docs/agents/code.md')} and, where it can be checked, add the check.`,
    findingsSection(facts.reviewFindings),
    "## This week's checklist",
    [
      '- [ ] Fix any failing check, and re-verify the docs listed above against the code.',
      '- [ ] Re-grade each row listed under Scores to re-grade, and set its Graded date.',
      `- [ ] Pay down one item from ${debtFiles.map(code).join(' or ')}, or split one file near the size limit, in a small pull request.`,
      `- [ ] For a part listed as repeated under Review findings, add the rule to ${code('docs/agents/code.md')} and, where possible, a check.`
    ].join('\n'),
    `Work this issue one item per small pull request, as ${code('docs/agents/ci-agents.md')} says under Weekly maintenance.`
  ]
  return `# Repository maintenance report\n\nGenerated ${facts.date} by ${code('pnpm maintenance:report')}.\n\n${sections.join('\n\n')}\n`
}
