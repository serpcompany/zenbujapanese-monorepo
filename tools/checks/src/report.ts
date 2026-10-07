import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findComments } from './comments/find'
import { findDeadCode } from './deadcode'
import { checkDependencies, parts } from './dependencies'
import { checkDocs, isOwnedDoc, referencedFiles } from './docs'
import { findDuplicates } from './duplicates'
import { repositoryFiles, root } from './files'
import { duplicateProblems, knownDuplicates } from './known-duplicates'
import { checkLayers } from './layers'
import { type CheckProblems, docsToReverify, lastChangeTimes, renderReport } from './maintenance'
import { findSecrets } from './secrets'
import { checkSizes, filesNearLimit, knownLargeFiles } from './sizes'
import { scoresToRegrade, summarizeDebt } from './work-tracking'

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const files = repositoryFiles()
const times = lastChangeTimes(git('log', '--format=%x00%ct', '--name-only'))

const comments = findComments(files)
const checks: CheckProblems[] = [
  {
    name: 'comments',
    problems: [
      ...comments.found.flatMap(file =>
        file.comments.map(comment => `${file.path}:${comment.line}  ${comment.text}`)
      ),
      ...comments.unclassified.map(file => `${file.path}  isn't classified`)
    ]
  },
  {
    name: 'docs',
    problems: checkDocs(files).map(
      problem => `${problem.path}${problem.line ? `:${problem.line}` : ''}  ${problem.problem}`
    )
  },
  {
    name: 'sizes',
    problems: checkSizes(files).map(problem => `${problem.path}  ${problem.problem}`)
  },
  {
    name: 'layers',
    problems: checkLayers(files).map(
      problem => `${problem.path}:${problem.line}  ${problem.problem}`
    )
  },
  { name: 'secrets', problems: await findSecrets(files) },
  { name: 'duplicates', problems: duplicateProblems(findDuplicates(files), files) },
  { name: 'deadcode', problems: findDeadCode() }
]

const ruleExplanation = /^ {4}\S|^x \d+ dependency violations/
const dependencyFindings: string[] = []
for (const part of parts) {
  const report = await checkDependencies(part)
  dependencyFindings.push(...report.filter(line => !ruleExplanation.test(line)))
}
checks.push({ name: 'dependencies', problems: dependencyFindings })

const docs = files
  .filter(isOwnedDoc)
  .map(doc => ({ doc, references: referencedFiles(doc, read(doc)) }))

process.stdout.write(
  renderReport({
    date: new Date().toISOString().slice(0, 10),
    checks,
    staleDocs: docsToReverify(docs, times),
    quality: scoresToRegrade(read('docs/quality.md'), times),
    debt: summarizeDebt(read('docs/tech-debt.md')),
    sizeExceptions: Object.entries(knownLargeFiles).map(([path, { lines }]) => ({ path, lines })),
    duplicateExceptions: Object.entries(knownDuplicates).map(([pair, { blocks }]) => ({
      pair,
      blocks
    })),
    nearLimit: filesNearLimit(files)
  })
)
