import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type Environ,
  installCommand,
  type Ran,
  sentryCli,
  tokenVariable,
  uploadSourceMaps
} from './upload-source-maps.ts'

const token = 'sntrys_a-token-that-must-never-be-printed'

type Call = { command: string[]; env: Environ; timeout?: number }

let folder: string
let calls: Call[]
let said: string[]

const say = {
  log: (message: string) => said.push(message),
  warn: (message: string) => said.push(message)
}

function build({ maps = true }: { maps?: boolean } = {}) {
  mkdirSync(join(folder, 'assets'))
  writeFileSync(join(folder, 'manifest.json'), JSON.stringify({ version: '0.1.0' }))
  writeFileSync(join(folder, 'service-worker.js'), 'self')
  writeFileSync(join(folder, 'assets', 'popup-abc.js'), 'page')
  if (maps) {
    writeFileSync(join(folder, 'service-worker.js.map'), '{}')
    writeFileSync(join(folder, 'assets', 'popup-abc.js.map'), '{}')
  }
}

function runner(answer: (call: Call) => Partial<Ran> = () => ({})) {
  return (command: string[], options: { env: Environ; timeout?: number }): Ran => {
    const call = { command, ...options }
    calls.push(call)
    return { status: 0, stdout: '', stderr: '', ...answer(call) }
  }
}

function filesLeft() {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' }).sort()
}

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'zenbu-source-maps-'))
  calls = []
  said = []
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

describe('uploadSourceMaps', () => {
  it("adds debug IDs and uploads the maps under the manifest's version, then takes them out of the build", () => {
    build()
    expect(uploadSourceMaps(folder, { [tokenVariable]: token }, runner(), say)).toBe(true)
    expect(calls.map(call => call.command.slice(4, 6))).toEqual([
      ['--version'],
      ['sourcemaps', 'inject'],
      ['sourcemaps', 'upload']
    ])
    expect(calls[0]?.command).toEqual(installCommand())
    expect(calls[2]?.command).toEqual([
      'npx',
      '--no',
      '--',
      sentryCli,
      'sourcemaps',
      'upload',
      '--org',
      'serpcompany',
      '--project',
      'zenbujapanese-extension',
      '--release',
      'zenbujapanese-extension@0.1.0',
      folder
    ])
    expect(filesLeft()).toEqual([
      'assets',
      'assets/popup-abc.js',
      'manifest.json',
      'service-worker.js'
    ])
  })

  it('gives the token only to the upload, never to the install or the injection, and never prints it', () => {
    build()
    const echoesToken = runner(() => ({ stdout: `Using ${token}`, stderr: `auth ${token}` }))
    uploadSourceMaps(folder, { [tokenVariable]: token, PATH: '/usr/bin' }, echoesToken, say)
    expect(calls.map(call => call.env[tokenVariable])).toEqual([undefined, undefined, token])
    expect(calls.every(call => call.env.PATH === '/usr/bin')).toBe(true)
    expect(said.join('\n')).not.toContain(token)
  })

  it.each([
    ['unset', {}],
    ['empty, as an Actions secret that is missing', { [tokenVariable]: '' }]
  ])('adds debug IDs with %s SENTRY_AUTH_TOKEN, then warns and asks nothing more, so no upload is tried', (_, environ: Environ) => {
    build()
    expect(uploadSourceMaps(folder, environ, runner(), say)).toBe(false)
    expect(calls.map(call => call.command.slice(4, 6).join(' '))).toEqual([
      '--version',
      'sourcemaps inject'
    ])
    expect(said.join('\n')).toMatch(/warning: no Sentry token in SENTRY_AUTH_TOKEN/)
    expect(filesLeft().filter(file => file.endsWith('.map'))).toEqual([])
  })

  it('warns when the upload fails or stalls, without the token, and still takes the maps out', () => {
    build()
    const stalls = runner(call =>
      call.command.includes('upload')
        ? {
            status: null,
            stderr: `stalled with ${token}`,
            error: new Error('spawnSync npx ETIMEDOUT')
          }
        : {}
    )
    expect(uploadSourceMaps(folder, { [tokenVariable]: token }, stalls, say)).toBe(false)
    expect(said.join('\n')).toMatch(
      /warning: couldn't upload the source maps \(spawnSync npx ETIMEDOUT\)/
    )
    expect(said.join('\n')).not.toContain(token)
    expect(filesLeft().filter(file => file.endsWith('.map'))).toEqual([])
  })

  it('stops before the upload when the install fails', () => {
    build()
    const noInstall = runner(call => (call.command.includes('--version') ? { status: 1 } : {}))
    expect(uploadSourceMaps(folder, { [tokenVariable]: token }, noInstall, say)).toBe(false)
    expect(calls).toHaveLength(1)
    expect(said.join('\n')).toMatch(/couldn't install @sentry\/cli@3\.8\.0 \(exit 1\)/)
  })

  it('warns about a build without maps', () => {
    build({ maps: false })
    expect(uploadSourceMaps(folder, { [tokenVariable]: token }, runner(), say)).toBe(false)
    expect(calls).toEqual([])
    expect(said.join('\n')).toMatch(/holds no source maps/)
  })
})
