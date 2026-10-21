import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { root } from './files'
import type { CheckProblems } from './maintenance'

const reportedChecks = [
  'comments',
  'docs',
  'sizes',
  'layers',
  'secrets',
  'duplicates',
  'deadcode',
  'dependencies'
]

const verdict = /^[\w-]+ (?:passed|failed)\b/

const finding = /^\S+ {2}\S/

export function checkProblems(output: string, names: readonly string[]): CheckProblems[] {
  const lines = output.replace(/\n+$/, '').split('\n')
  const verdicts = lines.findLast(line => verdict.test(line)) ?? ''
  const failed = new Set(
    [...verdicts.matchAll(/([\w-]+) failed/g)].map(found => found[1] as string)
  )
  const sections = new Map<string, string[]>()
  for (const section of lines.join('\n').split(/\n{2,}/)) {
    const [name, ...rest] = section.replace(/^\n+/, '').split('\n')
    if (name && names.includes(name)) sections.set(name, rest)
  }
  return names.map(name => {
    if (!failed.has(name)) return { name, problems: [] }
    const shown = sections.get(name) ?? []
    const findings = shown.filter(line => finding.test(line))
    if (findings.length) return { name, problems: findings }
    return { name, problems: shown.length ? shown : [`${name} failed`] }
  })
}

export function runSharedChecks(names: readonly string[] = reportedChecks): CheckProblems[] {
  const run = spawnSync(join(root, 'node_modules', '.bin', 'serp-verify'), [names.join(',')], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, CI: '' }
  })
  if (run.status !== 0 && run.status !== 1) {
    throw new Error(`serp-verify exited ${run.status}: ${run.stderr || run.error?.message}`)
  }
  return checkProblems(run.stdout, names)
}
