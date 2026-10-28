import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import http from 'node:http'
import { writeAtomically } from './files.mjs'
import { controlPort, statePath } from './paths.mjs'

const stuck = process.env.TEST_DAEMON_MODE === 'stuck'
const chrome = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })

function saveState(ready) {
  const state = {
    pid: process.pid,
    chromePid: chrome.pid,
    controlURL: `http://127.0.0.1:${controlPort}`,
    extensions: {},
    ready
  }
  writeAtomically(statePath, JSON.stringify(state))
}

if (stuck) {
  process.on('SIGTERM', () => {})
  saveState(false)
} else {
  http
    .createServer((request, response) => {
      response.end('{}')
      if (request.url !== '/quit') return
      chrome.kill()
      rmSync(statePath, { force: true })
      process.exit(0)
    })
    .listen(controlPort, '127.0.0.1', () => saveState(true))
}
setInterval(() => {}, 1000)
