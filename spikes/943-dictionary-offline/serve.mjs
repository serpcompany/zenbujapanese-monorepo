import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

const repo = resolve(import.meta.dirname, '../..')
const resources = process.env.RESOURCES ?? join(repo, 'apps/ios/Modules/Sources/SearchExperience/Resources')
const gzDir = join(repo, 'tmp/agent/gz')
const release = '2026.10.3'
const manifestPath = join(repo, 'language-data/releases', release, 'manifest.json')
const manifestBytes = readFileSync(manifestPath)
const manifest = JSON.parse(manifestBytes)
const rate = Number(process.env.RATE ?? 0)
const releasesJson = JSON.stringify({
  schema: 'zenbu.language-data-releases.v1',
  releases: [{ release, manifest_sha256: createHash('sha256').update(manifestBytes).digest('hex'), git_commit: 'spike', published_at: '2026-10-22T00:00:00Z' }]
})
const pathOf = name => (name === 'RetiredEntries.json' ? join(repo, 'language-data/derived', name) : join(resources, name))
const bySha = new Map(manifest.files.map(f => [`${f.sha256}/${f.name}`, f]))
let served = 0

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range' }

function throttled(stream, res) {
  if (!rate) return stream.pipe(res)
  let start = Date.now()
  let sent = 0
  stream.on('data', chunk => {
    sent += chunk.length
    res.write(chunk)
    const wait = (sent / rate) * 1000 - (Date.now() - start)
    if (wait > 0) {
      stream.pause()
      setTimeout(() => stream.resume(), wait)
    }
  })
  stream.on('end', () => res.end())
}

function sendFile(req, res, path, type) {
  const size = statSync(path).size
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '')
  if (range) {
    const from = Number(range[1])
    const to = range[2] ? Number(range[2]) : size - 1
    res.writeHead(206, { ...cors, 'Content-Type': type, 'Content-Length': to - from + 1, 'Content-Range': `bytes ${from}-${to}/${size}`, 'Accept-Ranges': 'bytes' })
    served += to - from + 1
    return throttled(createReadStream(path, { start: from, end: to }), res)
  }
  res.writeHead(200, { ...cors, 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable' })
  served += size
  throttled(createReadStream(path), res)
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end()
  if (url.pathname === '/releases.json') return res.writeHead(200, { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }).end(releasesJson)
  if (url.pathname === `/releases/${release}/manifest.json`) return res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end(manifestBytes)
  if (url.pathname === '/served') return res.writeHead(200, cors).end(String(served))
  if (url.pathname === '/page.html') return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(readFileSync(join(import.meta.dirname, 'page.html')))
  const file = /^\/files\/(.+)$/.exec(url.pathname)
  if (file && bySha.has(decodeURIComponent(file[1]))) return sendFile(req, res, pathOf(bySha.get(decodeURIComponent(file[1])).name), 'application/octet-stream')
  const gz = /^\/files-gz\/([0-9a-f]{64})\/(.+)\.gz$/.exec(url.pathname)
  if (gz && existsSync(join(gzDir, `${gz[2]}.gz`))) return sendFile(req, res, join(gzDir, `${gz[2]}.gz`), 'application/gzip')
  res.writeHead(404, cors).end('not found')
}).listen(8943, () => console.log(`serving release ${release} on 8943, rate ${rate || 'unlimited'}`))
