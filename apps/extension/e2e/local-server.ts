import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, relative } from 'node:path'
import {
  isGitLfsPointer,
  type LocalRelease,
  localRelease,
  repositoryRoot
} from './language-data.ts'

export type LocalServer = { url: string; release: LocalRelease; close(): Promise<void> }

const testPages = join(repositoryRoot, 'apps', 'extension', 'test-pages')
const staticPage = /^\/test-pages\/([\w-]+\.(html|css))$/
const contentTypes: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json'
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer) {
  response.writeHead(status, { 'content-type': type })
  response.end(body)
}

function sendFile(response: ServerResponse, path: string, type: string) {
  response.writeHead(200, { 'content-type': type, 'content-length': statSync(path).size })
  createReadStream(path).pipe(response)
}

function serveReleaseFile(response: ServerResponse, release: LocalRelease, key: string) {
  const file = release.files.get(key)
  if (!file || !existsSync(file.path)) return send(response, 404, 'text/plain', 'not found')
  if (isGitLfsPointer(file.path)) {
    const path = relative(repositoryRoot, file.path)
    return send(
      response,
      503,
      'text/plain',
      `Git LFS file not pulled: git lfs pull --include=${path}`
    )
  }
  sendFile(response, file.path, 'application/octet-stream')
}

export async function startLocalServer(port = 0): Promise<LocalServer> {
  const release = localRelease()
  const server = createServer((request, response) => {
    response.setHeader('access-control-allow-origin', '*')
    response.setHeader('cache-control', 'no-store')
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
    const page = staticPage.exec(path)
    const manifest = /^\/releases\/([\w.]+)\/manifest\.json$/.exec(path)?.[1]
    if (path === '/favicon.ico') return send(response, 204, 'image/x-icon', '')
    if (page) {
      const file = join(testPages, page[1])
      if (!existsSync(file)) return send(response, 404, 'text/plain', 'not found')
      return sendFile(response, file, contentTypes[page[2]])
    }
    if (path === '/releases.json')
      return send(response, 200, contentTypes.json, release.releasesJson)
    if (manifest && release.manifests.has(manifest)) {
      return send(response, 200, contentTypes.json, release.manifests.get(manifest) ?? '')
    }
    if (path.startsWith('/files/')) return serveReleaseFile(response, release, path.slice(7))
    send(response, 404, 'text/plain', 'not found')
  })
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  const { port: bound } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${bound}`,
    release,
    close: () => new Promise(resolve => server.close(() => resolve()))
  }
}
