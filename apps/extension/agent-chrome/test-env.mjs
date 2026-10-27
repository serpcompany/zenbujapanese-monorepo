import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'

function freePort() {
  return new Promise(done => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => done(port))
    })
  })
}

export async function isolateHarness() {
  const stateDir = mkdtempSync(join(tmpdir(), 'agent-chrome-test-'))
  process.env.AGENT_CHROME_STATE_DIR = stateDir
  afterAll(() => rmSync(stateDir, { recursive: true, force: true }))
  process.env.AGENT_CHROME_DEVTOOLS_PORT = String(await freePort())
  process.env.AGENT_CHROME_CONTROL_PORT = String(await freePort())
  return { stateDir, controlPort: Number(process.env.AGENT_CHROME_CONTROL_PORT) }
}
