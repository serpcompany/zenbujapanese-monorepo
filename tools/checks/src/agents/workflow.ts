import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { format } from 'node:util'
import { createContext, runInContext } from 'node:vm'
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
  'continue-on-error'?: boolean
  'timeout-minutes'?: number
}

interface Job {
  if?: string
  needs?: string | string[]
  concurrency?: { group: string; 'cancel-in-progress'?: boolean }
  'timeout-minutes'?: number
  permissions?: Record<string, string>
  outputs?: Record<string, string>
  env?: Record<string, string>
  steps?: Step[]
}

export interface Workflow {
  on: Record<string, unknown>
  concurrency?: { group: string; 'cancel-in-progress'?: boolean | string }
  permissions?: Record<string, string>
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
  const index = steps.findLastIndex(
    step =>
      step.run !== undefined &&
      Object.values(step.env ?? {}).some(value => String(value).includes(output))
  )
  return { step: steps[index], index }
}

export type Route = (
  url: URL,
  method: string,
  sent: string,
  accept: string
) =>
  | {
      status: number
      body: unknown
      text?: string
      nextPage?: string
      headers?: Record<string, string>
      lost?: 'answer' | 'body'
    }
  | undefined

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

type RunWithFiles = StepRun & { files: Record<string, string> }

interface Answer {
  status: number
  headers: Record<string, string>
  text: string
  lost?: 'answer' | 'body'
}

function answerOf(route: Route, url: URL, sent: SentRequest, accept: string): Answer {
  const answer = route(url, sent.method, sent.body, accept) ?? {
    status: 404,
    body: { message: 'Not Found' }
  }
  const link: Record<string, string> = answer.nextPage
    ? { link: `<${url.origin}${answer.nextPage}>; rel="next"` }
    : {}
  return {
    status: answer.status,
    headers: { 'content-type': 'application/json', ...link, ...answer.headers },
    text: answer.text ?? JSON.stringify(answer.body),
    lost: answer.lost
  }
}

function withFiles<Run extends StepRun>(
  files: Record<string, string>,
  run: (paths: Record<string, string>) => Promise<Run>
): Promise<Run & { files: Record<string, string> }> {
  const workDir = mkdtempSync(join(tmpdir(), 'workflow-step-'))
  const paths = Object.fromEntries(
    Object.entries(files).map(([name, text]) => {
      const path = join(workDir, name)
      writeFileSync(path, text)
      return [name, path]
    })
  )
  return run(paths)
    .then(result => ({
      ...result,
      files: Object.fromEntries(
        Object.entries(paths)
          .filter(([, path]) => existsSync(path))
          .map(([name, path]) => [name, readFileSync(path, 'utf8')])
      )
    }))
    .finally(() => rmSync(workDir, { recursive: true, force: true }))
}

const runnerEnvironment = (
  api: string,
  env: Record<string, string>,
  paths: Record<string, string>
) => ({
  ...process.env,
  GITHUB_API_URL: api,
  GITHUB_ENV: '',
  GITHUB_OUTPUT: '',
  GITHUB_STEP_SUMMARY: '',
  GITHUB_TOKEN: 'test-token',
  ...Object.fromEntries(Object.entries(env).map(([name, value]) => [name, paths[value] ?? value]))
})

export function runNodeStep(
  step: Step,
  env: Record<string, string>,
  route: Route,
  files: Record<string, string> = {}
): Promise<RunWithFiles & { secondsWaited: number }> {
  const written = Object.entries(step.env ?? {}).filter(([, value]) => !value.includes('${{'))
  return withFiles(files, paths =>
    runInlineScript(
      step.run ?? '',
      runnerEnvironment(inProcessApi, { ...Object.fromEntries(written), ...env }, paths),
      route
    )
  )
}

interface ScriptMachine {
  fetch: typeof fetch
  wait: (milliseconds: number) => Promise<void>
  now: () => number
  log: (line: string) => void
}

export function runNodeModule(
  start: (
    environment: Record<string, string | undefined>,
    machine: ScriptMachine
  ) => Promise<number>,
  env: Record<string, string>,
  route: Route,
  files: Record<string, string> = {}
): Promise<RunWithFiles & { secondsWaited: number }> {
  return withFiles(files, paths =>
    runInProcess(route, here => {
      const machine = {
        fetch: here.fetch as unknown as typeof fetch,
        wait: (milliseconds: number) =>
          new Promise<void>(resolve => here.setTimeout(() => resolve(), milliseconds)),
        now: here.now,
        log: here.say
      }
      start(runnerEnvironment(inProcessApi, env, paths), machine).then(status => {
        if (status !== 0) here.exitWith(status)
      }, here.crash)
    })
  )
}

export function runNodeScript(
  script: { path: string },
  env: Record<string, string>,
  route: Route,
  files: Record<string, string> = {}
): Promise<RunWithFiles> {
  return withFiles(files, async paths => {
    const requests: SentRequest[] = []
    const server = createServer((request: IncomingMessage, response) => {
      let body = ''
      request.on('data', (chunk: Buffer) => {
        body += chunk.toString()
      })
      request.on('end', () => {
        const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
        const sent = { method: request.method ?? 'GET', path: url.pathname, body }
        requests.push(sent)
        const answer = answerOf(route, url, sent, request.headers.accept ?? '')
        if (answer.lost === 'answer') {
          request.socket.destroy()
          return
        }
        const longer =
          answer.lost === 'body'
            ? { 'content-length': String(Buffer.byteLength(answer.text) + 1) }
            : {}
        response.writeHead(answer.status, { ...answer.headers, ...longer })
        if (answer.lost) response.write(answer.text, () => request.socket.destroy())
        else response.end(answer.text)
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      const child = spawn(process.execPath, [join(root, script.path)], {
        env: runnerEnvironment(api, env, paths)
      })
      let output = ''
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString()
      })
      const status = await new Promise<number | null>(resolve => child.on('close', resolve))
      return { status, output, requests }
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
}

const inProcessApi = 'https://api.github.test'

class Exited {}

function virtualClock() {
  const startedAt = Date.now()
  let now = 0
  let lastId = 0
  const timers = new Map<number, { due: number; fire: () => void }>()
  return {
    setTimeout(callback: (...values: unknown[]) => void, milliseconds = 0, ...values: unknown[]) {
      lastId += 1
      timers.set(lastId, {
        due: now + Math.max(0, Number(milliseconds) || 0),
        fire: () => callback(...values)
      })
      return lastId
    },
    clearTimeout(id: number) {
      timers.delete(id)
    },
    next() {
      const [id, timer] =
        [...timers].sort(([one, a], [other, b]) => a.due - b.due || one - other)[0] ?? []
      if (id === undefined || timer === undefined) return undefined
      timers.delete(id)
      now = timer.due
      return timer.fire
    },
    now: () => startedAt + now,
    secondsWaited: () => now / 1000
  }
}

const modulesAStepLoads = ['node:fs', 'node:path']
const load = createRequire(import.meta.url)

function loadForAStep(name: string): unknown {
  if (modulesAStepLoads.includes(name)) return load(name)
  throw new Error(`A step run in a test loads ${modulesAStepLoads.join(' and ')}, not ${name}`)
}

function answeredInProcess(route: Route, requests: SentRequest[], running: () => boolean) {
  return async (
    address: string,
    options: { method?: string; body?: string; headers?: Record<string, string> } = {}
  ) => {
    if (!running()) return new Promise<never>(() => {})
    const url = new URL(address)
    const sent = { method: options.method ?? 'GET', path: url.pathname, body: options.body ?? '' }
    requests.push(sent)
    const answer = answerOf(route, url, sent, new Headers(options.headers).get('accept') ?? '*/*')
    if (answer.lost === 'answer') throw new TypeError('fetch failed')
    const read = async () => {
      if (answer.lost === 'body') throw new TypeError('terminated')
      return answer.text
    }
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      headers: new Headers(answer.headers),
      text: read,
      json: async () => JSON.parse(await read())
    }
  }
}

interface InProcess {
  fetch: ReturnType<typeof answeredInProcess>
  setTimeout: ReturnType<typeof virtualClock>['setTimeout']
  clearTimeout: ReturnType<typeof virtualClock>['clearTimeout']
  now: () => number
  say: (...values: unknown[]) => void
  exitWith: (code: number) => void
  crash: (error: unknown) => void
}

async function runInProcess(
  route: Route,
  start: (here: InProcess) => void
): Promise<StepRun & { secondsWaited: number }> {
  const requests: SentRequest[] = []
  const clock = virtualClock()
  let output = ''
  let exitCode: number | undefined
  const running = () => exitCode === undefined
  const say = (...values: unknown[]) => {
    if (running()) output += `${format(...values)}\n`
  }
  const exitWith = (code: number) => {
    if (running()) exitCode = code
  }
  const crash = (error: unknown) => {
    if (error instanceof Exited || !running()) return
    say(error instanceof Error ? error.stack : error)
    exitWith(1)
  }
  try {
    start({
      fetch: answeredInProcess(route, requests, running),
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      now: clock.now,
      say,
      exitWith,
      crash
    })
  } catch (error) {
    crash(error)
  }
  for (;;) {
    await new Promise(resolve => setImmediate(resolve))
    const due = running() ? clock.next() : undefined
    if (due === undefined) break
    try {
      due()
    } catch (error) {
      crash(error)
    }
  }
  return { status: exitCode ?? 0, output, requests, secondsWaited: clock.secondsWaited() }
}

function runInlineScript(text: string, env: Record<string, string | undefined>, route: Route) {
  return runInProcess(route, here => {
    const context = createContext({
      process: {
        env,
        cwd: () => process.cwd(),
        exit: (code = 0) => {
          here.exitWith(code)
          throw new Exited()
        }
      },
      console: { log: here.say, error: here.say },
      require: loadForAStep,
      fetch: here.fetch,
      Headers,
      URL,
      AbortSignal: { timeout: () => new AbortController().signal },
      setTimeout: here.setTimeout,
      clearTimeout: here.clearTimeout
    })
    Promise.resolve(runInContext(text, context)).catch(here.crash)
  })
}
