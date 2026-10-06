import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { root } from '../files'

export interface Step {
  id?: string
  name?: string
  if?: string
  uses?: string
  shell?: string
  run?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
}

interface Job {
  if?: string
  concurrency?: { group: string; 'cancel-in-progress'?: boolean }
  'timeout-minutes'?: number
  permissions?: Record<string, string>
  env?: Record<string, string>
  steps?: Step[]
}

export interface Workflow {
  on: Record<string, unknown>
  concurrency?: { group: string; 'cancel-in-progress'?: boolean }
  jobs: Record<string, Job>
}

const workflowsFolder = '.github/workflows'
const claudeAction = 'anthropics/claude-code-action'

export function readRepositoryFile(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

export function readWorkflow(path: string): Workflow {
  return parse(readRepositoryFile(path)) as Workflow
}

export function workflowFiles(): string[] {
  return readdirSync(join(root, workflowsFolder))
    .filter(name => /\.ya?ml$/.test(name))
    .sort()
    .map(name => `${workflowsFolder}/${name}`)
}

export function workflowSteps(path: string, job?: string): Step[] {
  const workflow = readWorkflow(path)
  const jobs = job ? [workflow.jobs[job]] : Object.values(workflow.jobs)
  return jobs.flatMap(each => each?.steps ?? [])
}

export function claudeStep(steps: readonly Step[]): { step: Step; index: number } {
  const index = steps.findIndex(step => step.uses?.startsWith(claudeAction))
  return { step: steps[index], index }
}

export function claudeSteps(path: string): Step[] {
  return workflowSteps(path).filter(step => step.uses?.startsWith(claudeAction))
}

function toolList(step: Step, flag: string): string[] {
  const pattern = new RegExp(`${flag}\\s+"([^"]*)"`)
  const list = pattern.exec(String(step.with?.claude_args ?? ''))?.[1] ?? ''
  return list
    .split(',')
    .map(tool => tool.trim())
    .filter(Boolean)
}

export function allowedTools(step: Step): string[] {
  return toolList(step, '--allowedTools')
}

export function disallowedTools(step: Step): string[] {
  return toolList(step, '--disallowedTools')
}

export function guardAfter(steps: readonly Step[], claude: Step): { step: Step; index: number } {
  const output = `steps.${claude.id}.outputs.execution_file`
  const index = steps.findIndex(
    step =>
      step.run !== undefined &&
      Object.values(step.env ?? {}).some(value => String(value).includes(output))
  )
  return { step: steps[index], index }
}

export type Route = (url: URL, method: string) => { status: number; body: unknown } | undefined

interface SentRequest {
  method: string
  path: string
  body: string
}

export interface StepRun {
  status: number | null
  output: string
  requests: SentRequest[]
}

export async function runNodeStep(
  step: Step,
  env: Record<string, string>,
  route: Route,
  files: Record<string, string> = {}
): Promise<StepRun & { files: Record<string, string> }> {
  const workDir = mkdtempSync(join(tmpdir(), 'workflow-step-'))
  const requests: SentRequest[] = []
  const server = createServer((request: IncomingMessage, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    request.on('end', () => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const method = request.method ?? 'GET'
      requests.push({ method, path: url.pathname, body })
      const answer = route(url, method) ?? { status: 404, body: { message: 'Not Found' } }
      response.writeHead(answer.status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(answer.body))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const paths = Object.fromEntries(
      Object.entries(files).map(([name, text]) => {
        const path = join(workDir, name)
        writeFileSync(path, text)
        return [name, path]
      })
    )
    const script = join(workDir, 'step.cjs')
    writeFileSync(script, step.run ?? '')
    const resolved = Object.fromEntries(
      Object.entries(env).map(([name, value]) => [name, paths[value] ?? value])
    )
    const child = spawn(process.execPath, [script], {
      env: {
        ...process.env,
        GITHUB_API_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        GITHUB_ENV: '',
        GITHUB_OUTPUT: '',
        GITHUB_STEP_SUMMARY: '',
        GITHUB_TOKEN: 'test-token',
        ...resolved
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
    const written = Object.fromEntries(
      Object.entries(paths).map(([name, path]) => [name, readFileSync(path, 'utf8')])
    )
    return { status, output, requests, files: written }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(workDir, { recursive: true, force: true })
  }
}
