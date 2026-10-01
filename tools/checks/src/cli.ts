import { findComments } from './comments/find'
import { checkDocs } from './docs'
import { repositoryFiles, root } from './files'
import { runLinters } from './linters'
import { commentRule, docsRule, linterRule, sizeRule, unclassifiedRule } from './rules'
import { checkSizes } from './sizes'

interface Outcome {
  name: string
  passed: boolean
  report: string[]
}

type Check = (files: string[]) => Outcome

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

const checks: Record<string, Check> = { comments, docs, sizes, linters }

const [requested, ...paths] = process.argv.slice(2)
if (requested && !checks[requested]) {
  console.error(`Unknown check ${requested}. Run one of: ${Object.keys(checks).join(', ')}.`)
  process.exit(2)
}
const inRequestedPaths = (file: string) =>
  paths.some(path => {
    const prefix = path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '')
    return file === prefix || file.startsWith(`${prefix}/`)
  })
const files = paths.length ? repositoryFiles().filter(inRequestedPaths) : repositoryFiles()
if (paths.length && !files.length) {
  console.error(
    `No repository file is under ${paths.join(', ')}. Name paths relative to the repository root.`
  )
  process.exit(2)
}
const outcomes = (requested ? [requested] : Object.keys(checks)).map(name => checks[name](files))
for (const outcome of outcomes) {
  if (!outcome.report.length) continue
  console.log(`\n${outcome.name}\n${outcome.report.join('\n')}`)
}
console.log(
  `\n${outcomes.map(outcome => `${outcome.name} ${outcome.passed ? 'passed' : 'failed'}`).join(', ')} (${root})`
)
process.exit(outcomes.every(outcome => outcome.passed) ? 0 : 1)
