import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { logRequests } from './http'

function runScript(name: string, env: Record<string, string> = {}) {
  const script = fileURLToPath(new URL(`./test/${name}`, import.meta.url))
  const child = spawn(process.execPath, ['--import', 'tsx', script], {
    env: { ...process.env, ...env }
  })
  let output = ''
  const collect = (chunk: Buffer) => {
    output += chunk.toString()
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  const closed = new Promise<number | null>(resolve => child.on('close', resolve))
  const lineLogged = (message: string) =>
    output
      .split('\n')
      .slice(0, -1)
      .filter(line => line.startsWith('{'))
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .find(line => line.message === message)
  const logged = (message: string) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const look = () => {
        const line = lineLogged(message)
        if (line) resolve(line)
      }
      child.stdout.on('data', look)
      void closed.then(() =>
        reject(new Error(`${name} ended without logging ${message}: ${output}`))
      )
      look()
    })
  return { child, closed, logged, output: () => output }
}

afterEach(() => vi.restoreAllMocks())

function heldPort(): Promise<{ port: number; release: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const holder = createServer()
    holder.on('error', reject)
    holder.listen(0, '127.0.0.1', () => {
      const address = holder.address()
      if (typeof address !== 'object' || !address) return reject(new Error('no port'))
      resolve({
        port: address.port,
        release: () => new Promise(released => holder.close(() => released()))
      })
    })
  })
}

describe('logRequests', () => {
  test('logs the route pattern, never the path, with the status and time', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const app = new Hono()
    app.use(logRequests())
    app.get('/v1/words/:id', context => context.json({}, 404))
    await app.request('/v1/words/secret-1234')
    const line = JSON.parse(String(stdout.mock.calls[0][0]))
    expect(line).toMatchObject({
      message: 'request',
      method: 'GET',
      route: '/v1/words/:id',
      status: 404
    })
    expect(typeof line.ms).toBe('number')
    expect(JSON.stringify(line)).not.toContain('secret-1234')
  })
})

describe('serveUntilStopped', () => {
  test('serves until SIGTERM, then closes what the service holds once and exits cleanly', async () => {
    const { child, closed, logged, output } = runScript('stopping-service.ts', {
      PORT: '0',
      HOSTNAME_TO_SERVE: '127.0.0.1'
    })
    const listening = await logged('listening')
    expect(listening).toMatchObject({ address: '127.0.0.1', release: 'test' })
    expect(await (await fetch(`http://127.0.0.1:${listening.port}/`)).text()).toBe('ok')
    child.kill('SIGTERM')
    child.kill('SIGINT')
    expect(await closed).toBe(0)
    expect(output().match(/"message":"stopping","signal":"SIG(TERM|INT)"/g)).toHaveLength(1)
    expect(output().match(/^closed$/gm)).toHaveLength(1)
  })

  test('listens on the port it is given, and fails rather than share one already in use', async () => {
    const held = await heldPort()
    const { closed, output } = runScript('stopping-service.ts', {
      PORT: String(held.port),
      HOSTNAME_TO_SERVE: '127.0.0.1'
    })
    expect(await closed).toBe(1)
    expect(output()).toContain(`EADDRINUSE: address already in use 127.0.0.1:${held.port}`)
    expect(output()).not.toContain('"listening"')
    await held.release()
  })
})

describe('runService', () => {
  test('logs why the service failed to start, and exits with 1 for the deployer to see', async () => {
    const { closed, output } = runScript('failing-service.ts')
    expect(await closed).toBe(1)
    expect(output()).toContain('"message":"failed to start"')
    expect(output()).toContain('the database refused the migration')
  })
})
