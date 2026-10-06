import { findComments } from './comments/find'
import { findDeadCode } from './deadcode'
import { checkDependencies, parts } from './dependencies'
import { checkDocs } from './docs'
import { findDuplicates } from './duplicates'
import { repositoryFiles, root } from './files'
import { duplicateProblems } from './known-duplicates'
import { runLinters } from './linters'
import {
  commentRule,
  deadCodeRule,
  dependencyRule,
  docsRule,
  duplicateRule,
  linterRule,
  secretRule,
  sizeRule,
  unclassifiedRule
} from './rules'
import { findSecrets } from './secrets'
import { checkSizes } from './sizes'

interface Outcome {
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
  secrets,
  duplicates,
  deadcode,
  dependencies,
  linters
}

const [requested, ...paths] = process.argv.slice(2)
const names = requested ? requested.split(',') : Object.keys(checks)
const unknown = names.filter(name => !checks[name])
if (unknown.length) {
  console.error(
    `Unknown check ${unknown.join(', ')}. Run any of: ${Object.keys(checks).join(', ')}.`
  )
  process.exit(2)
}
const prefixes = paths.map(path =>
  path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '')
)
const inRequestedPaths = (file: string) =>
  prefixes.some(prefix => file === prefix || file.startsWith(`${prefix}/`))
const files = paths.length ? repositoryFiles().filter(inRequestedPaths) : repositoryFiles()
if (paths.length && !files.length) {
  console.error(
    `No repository file is under ${paths.join(', ')}. Name paths relative to the repository root.`
  )
  process.exit(2)
}
const outcomes: Outcome[] = []
for (const name of names) {
  outcomes.push(await checks[name](files, prefixes))
}
for (const outcome of outcomes) {
  if (!outcome.report.length) continue
  console.log(`\n${outcome.name}\n${outcome.report.join('\n')}`)
}
console.log(
  `\n${outcomes.map(outcome => `${outcome.name} ${outcome.passed ? 'passed' : 'failed'}`).join(', ')} (${root})`
)
process.exit(outcomes.every(outcome => outcome.passed) ? 0 : 1)
