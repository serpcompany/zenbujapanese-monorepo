import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Comment } from '../text'
import { excerpt } from '../text'

const helper = fileURLToPath(new URL('./python_comments.py', import.meta.url))

function python(): string {
  if (process.env.PYTHON) return process.env.PYTHON
  return process.platform === 'win32' ? 'python' : 'python3'
}

export function pythonComments(root: string, paths: readonly string[]): Map<string, Comment[]> {
  const found = new Map<string, Comment[]>()
  if (paths.length === 0) return found
  const run = spawnSync(python(), [helper], {
    cwd: root,
    input: paths.join('\n'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (run.error || run.status !== 0) {
    throw new Error(
      `Checking the Python files needs Python 3 (${python()}; set PYTHON to use another): ${
        run.error?.message ?? run.stderr
      }`
    )
  }
  for (const line of run.stdout.split('\n').filter(Boolean)) {
    const result = JSON.parse(line) as { path: string; comments: Comment[] }
    found.set(
      result.path,
      result.comments.map(comment => ({ ...comment, text: excerpt(comment.text) }))
    )
  }
  return found
}
