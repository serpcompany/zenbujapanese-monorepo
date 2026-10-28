import { execFileSync } from 'node:child_process'
import { createHash, X509Certificate } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { extname, join, normalize } from 'node:path'
import { standInPlayer, standInTimedText } from './paths.mjs'

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
}

function selfSignedCertificate(hosts, folder) {
  const key = join(folder, 'site-key.pem')
  const cert = join(folder, 'site-cert.pem')
  const names = hosts.map(host => `DNS:${host}`).join(',')
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '2',
      '-subj',
      `/CN=${hosts[0]}`,
      '-addext',
      `subjectAltName=${names}`,
      '-keyout',
      key,
      '-out',
      cert
    ],
    { stdio: 'ignore' }
  )
  const pem = readFileSync(cert)
  const spki = new X509Certificate(pem).publicKey.export({ type: 'spki', format: 'der' })
  return {
    key: readFileSync(key),
    cert: pem,
    spki: createHash('sha256').update(spki).digest('base64')
  }
}

const fixtureVideo = 'zenbuJa0001'

async function requestedVideo(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')).videoId ?? fixtureVideo
  } catch {
    return fixtureVideo
  }
}

const youTubeAnswers = {
  'youtubei/v1/player': async request => ({
    type: 'application/json',
    body: readFileSync(standInPlayer, 'utf8').replaceAll(
      fixtureVideo,
      await requestedVideo(request)
    )
  }),
  'api/timedtext': async () => ({ type: 'text/xml', body: readFileSync(standInTimedText, 'utf8') })
}

async function answerYouTube(answer, request, response, log) {
  const { type, body } = await answer(request)
  log(`${request.headers.host}${request.url} -> ${type}`)
  response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
  response.end(body)
}

export async function startStandInSite({ hosts, root, folder, log }) {
  const { key, cert, spki } = selfSignedCertificate(hosts, folder)
  const server = createServer({ key, cert }, (request, response) => {
    const path = normalize(new URL(request.url ?? '/', 'https://site').pathname).replace(/^\/+/, '')
    const youTube = youTubeAnswers[path]
    if (youTube) return void answerYouTube(youTube, request, response, log)
    const file = join(root, path)
    const served =
      path && file.startsWith(root) && existsSync(file) ? file : join(root, 'index.html')
    log(`${request.headers.host}${request.url} -> ${served.slice(root.length + 1)}`)
    response.writeHead(200, {
      'content-type': types[extname(served)] ?? 'application/octet-stream',
      'cache-control': 'no-store'
    })
    response.end(readFileSync(served))
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  return { port, spki, close: () => server.close() }
}

export function hostRules({ mapHosts, port, offline, extraRules = [] }) {
  const rules = [...extraRules, ...mapHosts.map(host => `MAP ${host} 127.0.0.1:${port}`)]
  if (offline) rules.push('MAP * ~NOTFOUND', 'EXCLUDE 127.0.0.1', 'EXCLUDE localhost')
  return rules.length ? [`--host-resolver-rules=${rules.join(', ')}`] : []
}
