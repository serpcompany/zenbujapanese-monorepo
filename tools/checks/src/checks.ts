import { findComments } from './comments/find'
import { findDeadCode } from './deadcode'
import { checkDependencies, parts } from './dependencies'
import { checkDocs } from './docs'
import { findDuplicates } from './duplicates'
import { repositoryFiles } from './files'
import { duplicateProblems } from './known-duplicates'
import { checkLayers } from './layers'
import { runLinters } from './linters'
import {
  commentRule,
  deadCodeRule,
  dependencyRule,
  docsRule,
  duplicateRule,
  layerRule,
  linterRule,
  secretRule,
  sizeRule,
  unclassifiedRule
} from './rules'
import { findSecrets } from './secrets'
import { checkSizes } from './sizes'

export interface Outcome {
  name: string
  passed: boolean
  report: string[]
}

type Check = (files: string[], paths: string[]) => Outcome | Promise<Outcome>

const comments: Check = files => {
  const { found, unclassified } = findComments(files)
  const count = found.reduce((total, file) => total + file.comments.length, 0)
  const report = found.flatMap(file =>
    file.comments.map(comment => `${file.path}:${comment.line}:${comment.column}  ${comment.text}`)
  )
  if (count) report.push(`${count} comments in ${found.length} files.`, commentRule)
  if (unclassified.length) report.push(...unclassified.map(file => file.path), unclassifiedRule)
  return { name: 'comments', passed: !count && !unclassified.length, report }
}

const docs: Check = files => {
  const problems = checkDocs(files)
  const report = problems.map(
    problem => `${problem.path}${problem.line ? `:${problem.line}` : ''}  ${problem.problem}`
  )
  if (problems.length) report.push(docsRule)
  return { name: 'docs', passed: !problems.length, report }
}

const sizes: Check = files => {
  const problems = checkSizes(files)
  const report = problems.map(problem => `${problem.path}  ${problem.problem}`)
  if (problems.length) report.push(sizeRule)
  return { name: 'sizes', passed: !problems.length, report }
}

const layers: Check = files => {
  const problems = checkLayers(files)
  const report = problems.map(problem => `${problem.path}:${problem.line}  ${problem.problem}`)
  if (problems.length) report.push(layerRule)
  return { name: 'layers', passed: !problems.length, report }
}

const linters: Check = files => {
  const results = runLinters(files)
  const report = results.flatMap(result => {
    if (result.status === 'passed') return []
    if (result.status === 'not available') {
      return [
        `${result.name} didn't run: Docker couldn't run ${result.output}, and it isn't installed.`
      ]
    }
    return [
      `${result.name} (${result.ranIn === 'docker' ? 'in Docker' : 'installed'}):`,
      result.output
    ]
  })
  const failed = results.some(
    result =>
      result.status === 'failed' || (Boolean(process.env.CI) && result.status === 'not available')
  )
  if (report.length) report.push(linterRule)
  return { name: 'linters', passed: !failed, report }
}

const secrets: Check = async files => {
  const report = await findSecrets(files)
  if (report.length) report.push(secretRule)
  return { name: 'secrets', passed: !report.length, report }
}

const duplicates: Check = files => {
  const report = duplicateProblems(findDuplicates(files), files)
  if (report.length) report.push(duplicateRule)
  return { name: 'duplicates', passed: !report.length, report }
}

const deadcode: Check = () => {
  const report = findDeadCode()
  if (report.length) report.push(deadCodeRule)
  return { name: 'deadcode', passed: !report.length, report }
}

const overlaps = (folder: string, path: string) =>
  folder === path || folder.startsWith(`${path}/`) || path.startsWith(`${folder}/`)

const dependencies: Check = async (_files, paths) => {
  const requested = paths.length
    ? parts.filter(part => paths.some(path => overlaps(part.folder, path)))
    : parts
  const report: string[] = []
  for (const part of requested) report.push(...(await checkDependencies(part)))
  if (report.length) report.push(dependencyRule)
  return { name: 'dependencies', passed: !report.length, report }
}

const checks: Record<string, Check> = {
  comments,
  docs,
  sizes,
  layers,
  secrets,
  duplicates,
  deadcode,
  dependencies,
  linters
}

export const checkNames = Object.keys(checks)

export function selectFiles(paths: readonly string[]): { files: string[]; prefixes: string[] } {
  const prefixes = paths.map(path =>
    path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '')
  )
  const all = repositoryFiles()
  if (!prefixes.length) return { files: all, prefixes }
  const inRequestedPaths = (file: string) =>
    prefixes.some(prefix => file === prefix || file.startsWith(`${prefix}/`))
  return { files: all.filter(inRequestedPaths), prefixes }
}

export async function runChecks(
  names: readonly string[],
  files: string[],
  prefixes: string[]
): Promise<Outcome[]> {
  const outcomes: Outcome[] = []
  for (const name of names) outcomes.push(await checks[name](files, prefixes))
  return outcomes
}

export function failureReport(outcomes: readonly Outcome[]): string {
  return outcomes
    .filter(outcome => outcome.report.length)
    .map(outcome => `\n${outcome.name}\n${outcome.report.join('\n')}`)
    .join('\n')
}
