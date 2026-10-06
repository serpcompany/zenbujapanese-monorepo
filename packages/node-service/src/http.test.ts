import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { logRequests } from './http'

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
  test('serves until SIGTERM, then closes what the service holds and exits cleanly', async () => {
    const port = await freePort()
    const script = fileURLToPath(new URL('./test/stopping-service.ts', import.meta.url))
    const child = spawn(process.execPath, ['--import', 'tsx', script], {
      env: { ...process.env, PORT: String(port) }
    })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    await vi.waitFor(() => expect(output).toContain('"listening"'), { timeout: 15_000 })
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('ok')
    child.kill('SIGTERM')
    const code = await new Promise<number | null>(resolve => child.on('close', resolve))
    expect(code).toBe(0)
    expect(output).toContain('"signal":"SIGTERM"')
    expect(output).toContain('closed')
  })
})
