import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  environment,
  github,
  outputsOf,
  type PullRequest,
  repository,
  ruleFiles
} from './code-review-support'
import { scratchFolder } from './scratch'
import { runNodeScript } from './workflow'

const contextScript = 'tools/checks/review-context.mjs'
const leftByThePullRequest = 'tmp/review-change/left-by-the-pull-request.patch'

export function checkoutWith(paths: string[]): string {
  const workspace = scratchFolder('review-checkout')
  for (const path of paths) {
    mkdirSync(dirname(join(workspace, path)), { recursive: true })
    writeFileSync(join(workspace, path), 'in the checkout\n')
  }
  return workspace
}

export async function giveContext(
  pullRequest: PullRequest,
  workspace = checkoutWith([leftByThePullRequest])
) {
  const changeFolder = join(workspace, 'tmp', 'review-change')
  const run = await runNodeScript(
    { path: contextScript },
    {
      ...environment,
      BASE_REF: pullRequest.base ?? 'main',
      RULES: ruleFiles.join(' '),
      CHANGE_DIR: changeFolder,
      CHANGE_FILE: 'change.json',
      CONTEXT_FILE: 'context.md',
      REVIEWERS_CONTEXT_FILE: 'reviewers-context.md',
      GITHUB_OUTPUT: 'output.txt',
      GITHUB_WORKSPACE: workspace
    },
    github(pullRequest),
    {
      'context.md': '',
      'reviewers-context.md': '',
      'output.txt': '',
      'change.json': '[]'
    }
  )
  const written = existsSync(changeFolder)
    ? Object.fromEntries(
        readdirSync(changeFolder).map(name => [
          name,
          readFileSync(join(changeFolder, name), 'utf8')
        ])
      )
    : {}
  return {
    ...run,
    context: run.files['context.md'],
    reviewersContext: run.files['reviewers-context.md'],
    outputs: outputsOf(run.files['output.txt']),
    change: JSON.parse(run.files['change.json']) as Record<string, string | null>[],
    changeFolder,
    workspace,
    written
  }
}

export const changed = (filename: string, status: string, patch?: string, details = {}) => ({
  filename,
  status,
  additions: patch?.split('\n').filter(line => line.startsWith('+')).length ?? 0,
  deletions: patch?.split('\n').filter(line => line.startsWith('-')).length ?? 0,
  ...(patch === undefined ? {} : { patch }),
  ...details
})

export const issue = (details: Record<string, unknown> = {}) => ({
  number: 542,
  title: 'Alert on the server deploys',
  url: 'https://github.com/i/542',
  body: '## Acceptance criteria\n\n- [ ] Posts each failure once',
  authorAssociation: 'COLLABORATOR',
  author: { login: 'francis' },
  repository: { nameWithOwner: repository },
  comments: { totalCount: 0, nodes: [] },
  ...details
})

export const comment = (
  login: string,
  authorAssociation: string,
  body: string,
  day = '2026-10-12'
) => ({
  body,
  createdAt: `${day}T08:00:00Z`,
  authorAssociation,
  author: { login }
})
