import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { testLanguageDataHost } from '../build/hosts.ts'
import { fixtureRelease, fixtureReleaseObjects } from './fixture-release.ts'

export type LocalServer = {
  url: string
  languageDataUrl: string
  hostRule: string
  release: string
  asked: string[]
  close(): Promise<void>
}

const testPages = fileURLToPath(new URL('../test-pages/', import.meta.url))
const staticPage = /^\/test-pages\/([\w-]+\.(html|css))$/
const contentTypes: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  bytes: 'application/octet-stream'
}

function send(response: ServerResponse, status: number, type: string, body: string | Uint8Array) {
  response.writeHead(status, { 'content-type': type })
  response.end(body)
}

function sendFile(response: ServerResponse, path: string, type: string) {
  response.writeHead(200, { 'content-type': type, 'content-length': statSync(path).size })
  createReadStream(path).pipe(response)
}

export async function startLocalServer(port = 0): Promise<LocalServer> {
  const objects = await fixtureReleaseObjects()
  const asked: string[] = []
  const server = createServer((request, response) => {
    response.setHeader('access-control-allow-origin', '*')
    response.setHeader('cache-control', 'no-store')
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
    const page = staticPage.exec(path)
    const key = path.slice(1)
    const object = objects.get(key)
    if (path === '/favicon.ico') return send(response, 204, 'image/x-icon', '')
    if (page) {
      const file = join(testPages, page[1])
      if (!existsSync(file)) return send(response, 404, 'text/plain', 'not found')
      return sendFile(response, file, contentTypes[page[2]])
    }
    if (!object) return send(response, 404, 'text/plain', 'not found')
    asked.push(key)
    send(response, 200, contentTypes[key.endsWith('.json') ? 'json' : 'bytes'], object)
  })
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  const { port: bound } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${bound}`,
    languageDataUrl: testLanguageDataHost,
    hostRule: `MAP ${new URL(testLanguageDataHost).host} 127.0.0.1:${bound}`,
    release: fixtureRelease,
    asked,
    close: () => new Promise(resolve => server.close(() => resolve()))
  }
}
