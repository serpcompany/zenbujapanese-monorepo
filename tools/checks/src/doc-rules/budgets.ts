import { posix } from 'node:path'

const wrapWidth = 100
const mapBudget = 120
const leafBudget = 300

export const knownLongDocs: Readonly<Record<string, number>> = {
  'apps/ios/docs/product/dictionary.md': 427,
  'apps/ios/docs/product/index.md': 581,
  'apps/ios/docs/product/translate.md': 357,
  'apps/web/docs/product/account.md': 345,
  'apps/web/docs/product/browse.md': 333,
  'apps/web/docs/product/dictionary.md': 1344,
  'docs/agents/account-api.md': 945,
  'docs/agents/account-clients.md': 602,
  'docs/agents/api-servers.md': 318,
  'docs/agents/ci.md': 614,
  'docs/agents/dictionary-api.md': 545,
  'docs/agents/dictionary-core.md': 605,
  'docs/agents/ios.md': 1375,
  'docs/agents/translate.md': 376,
  'docs/agents/web.md': 813,
  'docs/quality.md': 581,
  'docs/tech-debt.md': 308
}

export function wrappedLines(text: string): number {
  return text
    .replace(/\r?\n$/, '')
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil([...line].length / wrapWidth)), 0)
}

const mapNames = new Set(['AGENTS.md', 'CLAUDE.md'])

const isMap = (path: string) => path === 'README.md' || mapNames.has(posix.basename(path))

const isWrittenFromCode = (path: string) => path.startsWith('docs/api/')

export function budgetProblem(
  path: string,
  text: string,
  known: Readonly<Record<string, number>> = knownLongDocs
): string | undefined {
  if (isWrittenFromCode(path)) return undefined
  const size = wrappedLines(text)
  const budget = isMap(path) ? mapBudget : leafBudget
  const allowance = known[path]
  if (allowance === undefined) {
    if (size <= budget) return undefined
    return isMap(path)
      ? `is ${size} lines at a ${wrapWidth}-character wrap, and a map gets ${mapBudget}: it only routes, so move detail into the doc it routes to`
      : `is ${size} lines at a ${wrapWidth}-character wrap, and a doc gets ${leafBudget}: split it by topic into docs a map links`
  }
  if (size <= budget) return `now fits its budget of ${budget}: remove it from knownLongDocs`
  if (size > allowance) {
    return `grew to ${size} lines, over its allowance of ${allowance}: it may shrink but not grow, so split it by topic`
  }
  if (size < allowance) {
    return `is down to ${size} lines: lower its entry in knownLongDocs to ${size}`
  }
  return undefined
}

export function staleAllowances(
  exists: (path: string) => boolean,
  known: Readonly<Record<string, number>> = knownLongDocs
): string[] {
  return Object.keys(known).filter(path => !exists(path))
}
