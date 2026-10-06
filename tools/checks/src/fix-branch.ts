import { execFileSync } from 'node:child_process'
import { root } from './files'
import { fixRule, fixWithoutTest } from './fixes'

const [branch = '', base = 'HEAD^1'] = process.argv.slice(2)
const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=d', base, 'HEAD'], {
  cwd: root,
  encoding: 'utf8'
})
  .split('\n')
  .filter(Boolean)

if (fixWithoutTest(branch, changed)) {
  console.log(`${branch} changes no test:\n${changed.join('\n')}\n\n${fixRule}`)
  process.exit(1)
}
console.log(`${branch}: ${branch.startsWith('fix/') ? 'changes a test' : 'not a fix/ branch'}`)
