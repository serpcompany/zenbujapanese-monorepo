import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { releaseName, sentryOrganization, sentryProject } from './error-reports.ts'

export const sentryCli = '@sentry/cli@3.8.0'
export const tokenVariable = 'SENTRY_AUTH_TOKEN'
const installTimeout = 300_000
const uploadTimeout = 600_000
const usage = 'usage: pnpm upload-source-maps [a build folder, dist by default]'

export type Environ = Record<string, string | undefined>
export type Ran = { status: number | null; stdout: string; stderr: string; error?: Error }
export type Run = (command: string[], options: { env: Environ; timeout?: number }) => Ran
export type Say = { log(message: string): void; warn(message: string): void }

type Step = { what: string; command: string[]; env: Environ; timeout: number }

export function sourceMaps(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter(path => path.endsWith('.map'))
    .map(path => join(folder, path))
    .sort()
}

export function installCommand(): string[] {
  return ['npx', '--yes', '--', sentryCli, '--version']
}

export function injectCommand(folder: string): string[] {
  return ['npx', '--no', '--', sentryCli, 'sourcemaps', 'inject', folder]
}

export function uploadCommand(folder: string, release: string): string[] {
  return [
    'npx',
    '--no',
    '--',
    sentryCli,
    'sourcemaps',
    'upload',
    '--org',
    sentryOrganization,
    '--project',
    sentryProject,
    '--release',
    release,
    folder
  ]
}

function warning(message: string): string {
  return `warning: ${message}. The build is fine; build it again and upload its source maps later.`
}

function hidden(text: string, token: string): string {
  return (token ? text.replaceAll(token, '<token>') : text).slice(-2000)
}

function withoutToken(environ: Environ): Environ {
  return Object.fromEntries(Object.entries(environ).filter(([key]) => key !== tokenVariable))
}

function preparing(folder: string, environ: Environ): Step[] {
  return [
    {
      what: `install ${sentryCli}`,
      command: installCommand(),
      env: withoutToken(environ),
      timeout: installTimeout
    },
    {
      what: 'add debug IDs to the build',
      command: injectCommand(folder),
      env: withoutToken(environ),
      timeout: installTimeout
    }
  ]
}

function uploading(folder: string, release: string, environ: Environ, token: string): Step {
  return {
    what: 'upload the source maps',
    command: uploadCommand(folder, release),
    env: { ...withoutToken(environ), [tokenVariable]: token },
    timeout: uploadTimeout
  }
}

function runStep(step: Step, run: Run, say: Say, token: string): Ran | undefined {
  const ran = run(step.command, { env: step.env, timeout: step.timeout })
  if (ran.error === undefined && ran.status === 0) return ran
  const reason = ran.error?.message ?? `exit ${ran.status}`
  say.warn(warning(`couldn't ${step.what} (${hidden(reason, token)})`))
  say.warn(hidden(ran.stderr, token))
  return undefined
}

function send(folder: string, maps: string[], environ: Environ, run: Run, say: Say): boolean {
  if (maps.length === 0) {
    say.warn(warning(`${folder} holds no source maps, so none went to Sentry`))
    return false
  }
  const { version } = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'))
  const release = releaseName(version)
  const token = environ[tokenVariable]?.trim() ?? ''
  for (const step of preparing(folder, environ)) {
    if (!runStep(step, run, say, token)) return false
  }
  if (!token) {
    say.warn(warning(`no Sentry token in ${tokenVariable}, so nothing went to Sentry`))
    return false
  }
  const uploaded = runStep(uploading(folder, release, environ, token), run, say, token)
  if (!uploaded) return false
  say.log(hidden(uploaded.stdout, token))
  say.log(`Uploaded ${maps.length} source maps to Sentry's ${sentryProject} as ${release}.`)
  return true
}

export function uploadSourceMaps(folder: string, environ: Environ, run: Run, say: Say): boolean {
  const maps = sourceMaps(folder)
  try {
    return send(folder, maps, environ, run, say)
  } finally {
    for (const map of maps) rmSync(map)
    if (maps.length > 0) say.log(`Removed ${maps.length} source maps from ${folder}.`)
  }
}

const runCommand: Run = ([command = '', ...args], { env, timeout }) => {
  const ran = spawnSync(command, args, { env, timeout, encoding: 'utf8' })
  return {
    status: ran.status,
    stdout: ran.stdout ?? '',
    stderr: ran.stderr ?? '',
    error: ran.error
  }
}

export function main(args: string[]): number {
  if (args.length > 1) {
    console.error(usage)
    return 2
  }
  uploadSourceMaps(resolve(args[0] ?? 'dist'), process.env, runCommand, {
    log: message => console.log(message),
    warn: message => console.error(message)
  })
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
