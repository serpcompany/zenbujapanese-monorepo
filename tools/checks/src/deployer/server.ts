import { type ChildProcess, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe } from 'vitest'
import { scratchFolder } from '../agents/scratch'
import { readRepositoryFile } from '../agents/workflow'
import { Docker } from './docker'
import { bash, installStandIns } from './stand-ins'

const script = 'deploy/deployer.sh'
const pinnedPath = /^export PATH=(\S+)$/gm
const serverPaths = /(?<![\w.-])\/(etc|var\/lib|run)\/zenbujapanese-/g
const outsideTheScratchTree = /(?<![\w.-])\/(etc|var|run|usr)\/\S*/g
const signerIssuer = 'https://token.actions.githubusercontent.com'
const runLimitMs = 20_000
const busyMachineMs = 60_000

export const webhook = 'https://hooks.slack.com/services/stand-in/for/tests'
export const alertsFile = 'etc/zenbujapanese-deployer/alerts.env'
export const dictionary = 'dictionary-api'
export const account = 'account-api'
export const network = `zenbujapanese-${dictionary}`
export const database = 'zenbujapanese-account-db'
export const alias = `${network}-staging`
export const slotA = `${alias}-a`
export const slotB = `${alias}-b`
export const settingsFile = `etc/${network}/staging.env`
export const registryFile = `etc/${network}/registry.env`
export const failedFile = `var/lib/${network}/failed-staging`
export const memory = `run/${network}.alerted-staging`

export interface Run {
  status: number | null
  signal: NodeJS.Signals | null
  output: string
}

function movedInto(root: string, text: string): string {
  const moved = text
    .replace(pinnedPath, `export PATH=${root}/bin`)
    .replace(serverPaths, `${root}/$1/zenbujapanese-`)
  const [, ...body] = moved.replaceAll(`${root}/`, '').split('\n')
  const left = body.join('\n').match(outsideTheScratchTree)
  if ([...text.matchAll(pinnedPath)].length !== 1 || left) {
    throw new Error(
      `${script} must set PATH once, and name no folder of the server's that the tests don't move into their scratch tree: ${left?.join(', ') ?? 'it sets PATH more or less than once'}`
    )
  }
  return moved
}

function signal(child: ChildProcess, name: NodeJS.Signals): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-child.pid, name)
  } catch {
    child.kill(name)
  }
}

const shutDowns: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const shutDown of shutDowns.splice(0)) await shutDown()
}, busyMachineMs)

export const describeDeployer = (title: string, tests: () => void) =>
  describe.skipIf(!bash)(title, { timeout: busyMachineMs }, tests)

export async function startServer() {
  if (!bash) throw new Error(`${script} needs bash 4.4 or later, which this machine doesn't have`)
  const shell = bash
  const root = scratchFolder('server')
  const source = readRepositoryFile(script)
  const hostFolders = (new RegExp(pinnedPath.source, 'm').exec(source)?.[1] ?? '').split(':')
  const docker = new Docker()
  const journal: { tag: string; line: string }[] = []
  const slept: string[] = []
  const sent: { url: string; body: string; args: string[] }[] = []
  const slack = {
    status: 0,
    code: '200',
    interrupt: undefined as (() => void | Promise<void>) | undefined
  }
  const host = { user: '0', roomForFolders: true }
  const running = new Set<ChildProcess>()
  const path = (...parts: string[]) => join(root, ...parts)
  const write = (file: string, text: string) => {
    mkdirSync(dirname(path(file)), { recursive: true })
    writeFileSync(path(file), text)
  }
  if (!/^[\w/.-]+$/.test(root)) throw new Error(`the scratch tree's path needs quoting: ${root}`)
  for (const folder of ['etc', 'run', 'tmp', 'var/lib'])
    mkdirSync(path(folder), { recursive: true })

  const standIns = await installStandIns(path('bin'), shell, hostFolders, {
    docker: args => docker.run(args),
    cosign: ([command, identityOption, identity, issuerOption, issuer, reference, ...more]) => {
      const asked = `${command} ${identityOption} ${issuerOption}`
      if (asked !== 'verify --certificate-identity --certificate-oidc-issuer' || more.length) {
        return undefined
      }
      const signedBy = docker.imageAt(reference)?.signedBy
      return { status: issuer === signerIssuer && signedBy === identity ? 0 : 1 }
    },
    curl: async args => {
      const body = args.pop() ?? ''
      const config = args.pop() ?? ''
      sent.push({ url: /^url = "(.*)"$/m.exec(config)?.[1] ?? '', body, args })
      await slack.interrupt?.()
      return { status: slack.status, stdout: slack.code }
    },
    logger: ([tagOption, tag, dashes, line, ...more]) => {
      if (tagOption !== '--tag' || dashes !== '--' || line === undefined || more.length) {
        return undefined
      }
      journal.push({ tag, line })
      return {}
    },
    id: args => (args.join(' ') === '-u' ? { stdout: `${host.user}\n` } : undefined),
    sleep: ([seconds, ...more]) => {
      if (more.length || !/^\d+$/.test(seconds ?? '')) return undefined
      slept.push(seconds)
      return {}
    },
    mktemp: args => {
      if (args.join(' ') !== '-d') return undefined
      if (host.roomForFolders) return { stdout: `${mkdtempSync(path('tmp/run-'))}\n` }
      return { status: 1, stderr: 'mktemp: failed to create directory: No space left on device' }
    }
  })

  const stop = (name: NodeJS.Signals = 'SIGTERM') => {
    for (const child of running) signal(child, name)
  }
  shutDowns.push(async () => {
    stop('SIGKILL')
    await standIns.close()
  })

  return {
    root,
    docker,
    slack,
    host,
    sent,
    slept,
    standIns,
    path,
    write,
    stop,
    read: (file: string) => (existsSync(path(file)) ? readFileSync(path(file), 'utf8') : undefined),
    lines: () => journal.map(each => each.line),
    tags: () => [...new Set(journal.map(each => each.tag))],
    messages: () => sent.map(each => (JSON.parse(each.body) as { text: string }).text),
    asked: (words: string) =>
      standIns.calls.findLastIndex(call => `${call.tool} ${call.args.join(' ')}`.startsWith(words)),
    slots: (service: string, environment = 'staging') =>
      docker.containers.filter(
        each =>
          each.state === 'running' &&
          each.labels[`zenbujapanese.${service}.environment`] === environment
      ),
    setUp(service: string, environments: Record<string, string> = { staging: 'PORT=8788\n' }) {
      mkdirSync(path(`etc/zenbujapanese-${service}`), { recursive: true })
      for (const [environment, settings] of Object.entries(environments)) {
        write(`etc/zenbujapanese-${service}/${environment}.env`, settings)
      }
      docker.networks.set(`zenbujapanese-${service}`, {
        internal: service === dictionary,
        members: ['nginx']
      })
      if (service === account) docker.networks.set(database, { internal: true, members: [] })
    },
    async run(edit: (text: string) => string = text => text): Promise<Run> {
      const installed = 'usr/local/bin/zenbujapanese-deployer'
      write(`${installed}.new`, movedInto(root, edit(source)))
      renameSync(path(`${installed}.new`), path(installed))
      const child = spawn(shell, [path(installed)], {
        cwd: root,
        env: {},
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let output = ''
      let overran = false
      running.add(child)
      for (const stream of [child.stdout, child.stderr]) {
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString()
        })
      }
      const watchdog = setTimeout(() => {
        overran = true
        signal(child, 'SIGKILL')
      }, runLimitMs)
      await new Promise<void>(resolve => child.on('close', () => resolve()))
      clearTimeout(watchdog)
      running.delete(child)
      if (overran) throw new Error(`the script was still running after ${runLimitMs} ms: ${output}`)
      if (standIns.unknown.length) {
        throw new Error(
          `the stand-ins don't know what the script asked: ${standIns.unknown.join('; ')}`
        )
      }
      return { status: child.exitCode, signal: child.signalCode, output }
    }
  }
}

export type Server = Awaited<ReturnType<typeof startServer>>

export async function serverWith(service = dictionary): Promise<Server> {
  const server = await startServer()
  server.setUp(service)
  server.write(alertsFile, `SLACK_WEBHOOK_URL=${webhook}\n`)
  return server
}

export const problem = (text: string, service = dictionary) => `Deploy problem: ${service}: ${text}`

export const deployed = (text: string, service = dictionary) => `Deployed: ${service}: ${text}`
