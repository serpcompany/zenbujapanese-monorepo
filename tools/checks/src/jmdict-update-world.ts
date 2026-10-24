import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { outsideGit, scratchFolder } from './agents/scratch'
import { readWorkflow, type Step, workflowSteps } from './agents/workflow'

export const workflowPath = '.github/workflows/jmdict-update.yml'
export const workflow = readWorkflow(workflowPath)
export const steps = workflowSteps(workflowPath, 'update')
export const repository = 'serpcompany/zenbujapanese-monorepo'

export function stepNamed(name: string): Step {
  const step = steps.find(each => each.name === name)
  if (!step) throw new Error(`${workflowPath} has no step named "${name}"`)
  return step
}

const pythonNames = ['python3', 'python3.14', 'python3.13', 'python3.12']
const usualFolders = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '/usr/bin',
  join(homedir(), '.local/bin')
]

function isNewEnough(candidate: string): boolean {
  const answer = spawnSync(candidate, ['-c', 'import sys; print(sys.version_info >= (3, 12))'], {
    encoding: 'utf8'
  })
  return answer.stdout?.trim() === 'True'
}

function findPython(): string | undefined {
  const folders = [...(process.env.PATH ?? '').split(delimiter).filter(Boolean), ...usualFolders]
  for (const name of pythonNames) {
    const found = folders
      .map(folder => join(folder, name))
      .find(candidate => existsSync(candidate) && isNewEnough(candidate))
    if (found) return found
  }
  return undefined
}

export const python = findPython()

export const uvRunsPython = (found: string) =>
  [
    '[ "$1 $2 $3" = "run --no-project python" ] || { echo "uv ran as: $*" >&2; exit 64; }',
    'shift 3',
    `exec "${found}" "$@"`
  ].join('\n')

export const recordsItsCall = (log: string, status = 0, answer = '') =>
  [`printf '%s\\n' "$*" >> "${log}"`, answer ? `printf '%s\\n' '${answer}'` : '', `exit ${status}`]
    .filter(Boolean)
    .join('\n')

export interface StepRun {
  status: number | null
  output: string
  githubEnv: string
}

const literalJobEnv = Object.fromEntries(
  Object.entries(workflow.jobs.update.env ?? {}).filter(([, value]) => !value.includes('${{'))
)

export async function runStep(
  step: Step,
  options: { cwd: string; env?: Record<string, string>; standIns?: Record<string, string> }
): Promise<StepRun> {
  const folder = scratchFolder('jmdict-step')
  const bin = join(folder, 'bin')
  mkdirSync(bin)
  for (const [name, script] of Object.entries(options.standIns ?? {})) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${script}\n`)
    chmodSync(join(bin, name), 0o755)
  }
  const githubEnv = join(folder, 'github-env')
  writeFileSync(githubEnv, '')
  const child = spawn('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', step.run ?? ''], {
    cwd: options.cwd,
    env: {
      ...outsideGit(),
      ...literalJobEnv,
      GITHUB_ENV: githubEnv,
      GITHUB_STEP_SUMMARY: join(folder, 'step-summary.md'),
      GITHUB_REPOSITORY: repository,
      RUNNER_TEMP: folder,
      ...options.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`
    }
  })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  const status = await new Promise<number | null>(resolve => child.on('close', resolve))
  return { status, output, githubEnv: readFileSync(githubEnv, 'utf8') }
}

export type Served = Record<string, Buffer | number>

export async function standInEdrdg<Result>(
  served: Served,
  use: (base: string) => Promise<Result>
): Promise<Result> {
  const server = createServer((request, response) => {
    const answer = served[request.url ?? '']
    if (answer === undefined || typeof answer === 'number') {
      response.writeHead(typeof answer === 'number' ? answer : 404)
      response.end()
      return
    }
    response.writeHead(200, {
      'content-type': 'application/x-gzip',
      'last-modified': 'Sun, 01 Nov 2026 03:30:24 GMT',
      etag: `"${answer.length.toString(16)}-test"`
    })
    response.end(answer)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    return await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
