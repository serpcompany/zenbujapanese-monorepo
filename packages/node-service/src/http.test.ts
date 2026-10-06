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
  return { child, closed, output: () => output }
}

afterEach(() => vi.restoreAllMocks())

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port'))
      )
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
    const port = await freePort()
    const { child, closed, output } = runScript('stopping-service.ts', { PORT: String(port) })
    await vi.waitFor(() => expect(output()).toContain('"listening"'), { timeout: 15_000 })
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('ok')
    child.kill('SIGTERM')
    child.kill('SIGINT')
    expect(await closed).toBe(0)
    expect(output().match(/"message":"stopping","signal":"SIG(TERM|INT)"/g)).toHaveLength(1)
    expect(output().match(/^closed$/gm)).toHaveLength(1)
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
