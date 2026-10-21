import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { referencedFiles, treeOf } from './doc-references'
import { isWrittenHere, readVerifyConfig, repositoryFiles, root } from './files'
import { docsToReverify, lastChangeTimes, renderReport } from './maintenance'
import { filesNearLimit } from './near-limit'
import { groupFindings, readFindings } from './review-findings'
import { runSharedChecks } from './shared-checks'
import { debtFiles, qualityFiles, scoresToRegrade, summarizeDebt } from './work-tracking'

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const collectedFindings = join(root, 'tmp/review-findings.json')
const files = repositoryFiles()
const config = readVerifyConfig()
const times = lastChangeTimes(git('log', '--format=%x00%ct', '--name-only'))
const tree = treeOf(files)
const pathRoots = config.docs?.pathRoots ?? []
const allowances = (list: keyof NonNullable<typeof config.exceptions>) =>
  Object.entries(config.exceptions?.[list] ?? {})

const docs = files
  .filter(path => path.endsWith('.md') && isWrittenHere(path, config))
  .map(doc => ({ doc, references: referencedFiles(doc, read(doc), tree, pathRoots) }))

process.stdout.write(
  renderReport({
    date: new Date().toISOString().slice(0, 10),
    checks: runSharedChecks(),
    staleDocs: docsToReverify(docs, times),
    quality: scoresToRegrade(qualityFiles.map(read).join('\n'), times),
    debt: summarizeDebt(debtFiles.map(read).join('\n')),
    sizeExceptions: allowances('knownLargeFiles').map(([path, { lines = 0 }]) => ({ path, lines })),
    longDocs: allowances('knownLongDocs')
      .map(([path, { lines = 0 }]) => ({ path, lines }))
      .sort((a, b) => b.lines - a.lines),
    duplicateExceptions: allowances('knownDuplicates').map(([pair, { blocks = 0 }]) => ({
      pair,
      blocks
    })),
    nearLimit: filesNearLimit(files, config),
    reviewFindings: existsSync(collectedFindings)
      ? groupFindings(readFindings(JSON.parse(readFileSync(collectedFindings, 'utf8'))))
      : null
  })
)
