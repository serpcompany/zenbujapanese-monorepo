import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findComments } from './comments/find'
import { checkDocs, isOwnedDoc, referencedFiles } from './docs'
import { repositoryFiles, root } from './files'
import { docsToReverify, lastChangeTimes, renderReport } from './maintenance'
import { checkSizes, filesNearLimit, knownLargeFiles } from './sizes'

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const files = repositoryFiles()
const times = lastChangeTimes(git('log', '--format=%x00%ct', '--name-only'))

const comments = findComments(files)
const checks = [
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
  }
]

const docs = files
  .filter(isOwnedDoc)
  .map(doc => ({ doc, references: referencedFiles(doc, read(doc)) }))

const qualitySeconds = times.get('docs/quality.md')
const codeCommitsSinceQuality = qualitySeconds
  ? Number(
      git(
        'rev-list',
        '--count',
        `--since=${qualitySeconds + 1}`,
        'HEAD',
        '--',
        'apps',
        'packages',
        'language-data',
        'tools'
      ).trim()
    )
  : 0

process.stdout.write(
  renderReport({
    date: new Date().toISOString().slice(0, 10),
    checks,
    staleDocs: docsToReverify(docs, times),
    debtRows: read('docs/tech-debt.md')
      .split('\n')
      .filter(line => line.startsWith('| ') && !/^\|\s*(-|Debt\b)/.test(line)).length,
    sizeExceptions: Object.entries(knownLargeFiles).map(([path, { lines }]) => ({ path, lines })),
    nearLimit: filesNearLimit(files),
    qualityChanged: qualitySeconds
      ? new Date(qualitySeconds * 1000).toISOString().slice(0, 10)
      : null,
    codeCommitsSinceQuality
  })
)
