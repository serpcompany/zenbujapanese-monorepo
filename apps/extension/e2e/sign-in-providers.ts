import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { testGoogleClientId } from '../build/hosts.ts'
import { appleAuthorizeUrl, googleAuthorizeUrl } from '../src/service-worker/account/identity.ts'

type Claims = Record<string, unknown>

type Certificate = { key: Buffer; cert: Buffer; spki: string }

type SiteModule = { selfSignedCertificate(hosts: string[], folder: string): Certificate }

const agentChrome = join(import.meta.dirname, '..', 'agent-chrome')

const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

function provider(issuer: string, kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }] }
  const signed = (claims: Claims) => {
    const now = Math.floor(Date.now() / 1000)
    const head = encoded({ alg: 'RS256', kid, typ: 'JWT' })
    const body = encoded({ iss: issuer, iat: now, exp: now + 600, ...claims })
    const signature = sign('sha256', Buffer.from(`${head}.${body}`), privateKey)
    return `${head}.${body}.${signature.toString('base64url')}`
  }
  return { jwks, signed }
}

const escaped = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')

function formPostTo(action: string, values: Record<string, string>) {
  const inputs = Object.entries(values)
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escaped(value)}">`)
    .join('')
  return `<!doctype html><form method="post" action="${escaped(action)}">${inputs}</form><script>document.forms[0].submit()</script>`
}

export const googleOrigin = 'https://accounts.google.com'

export const appleOrigin = 'https://appleid.apple.com'

export type SignInProviders = Awaited<ReturnType<typeof startSignInProviders>>

export async function startSignInProviders() {
  const google = provider(googleOrigin, 'google-test-key')
  const apple = provider(appleOrigin, 'apple-test-key')
  const learner = { google: 'google-learner@example.com', apple: 'apple-learner@example.com' }
  const asked: string[] = []

  const googleAnswer = (query: URLSearchParams) => {
    const idToken = google.signed({
      aud: query.get('client_id'),
      sub: `google-${learner.google}`,
      email: learner.google,
      email_verified: true,
      nonce: query.get('nonce')
    })
    const back = new URLSearchParams({ state: query.get('state') ?? '', id_token: idToken })
    return `${query.get('redirect_uri')}#${back}`
  }

  const appleAnswer = (query: URLSearchParams) => {
    const subject = `apple-${learner.apple}`
    const idToken = apple.signed({
      aud: query.get('client_id'),
      sub: subject,
      email: learner.apple,
      email_verified: 'true',
      nonce: query.get('nonce'),
      nonce_supported: true
    })
    return formPostTo(query.get('redirect_uri') ?? '', {
      state: query.get('state') ?? '',
      code: `apple-code:${subject}`,
      id_token: idToken,
      user: JSON.stringify({ name: { firstName: 'Aiko', lastName: 'Sato' } })
    })
  }

  const { selfSignedCertificate }: SiteModule = await import(
    pathToFileURL(join(agentChrome, 'site.mjs')).href
  )
  const hosts = [new URL(googleOrigin).host, new URL(appleOrigin).host]
  const folder = mkdtempSync(join(tmpdir(), 'zenbu-sign-in-'))
  const { key, cert, spki } = selfSignedCertificate(hosts, folder)
  const server: Server = createServer({ key, cert }, (request, response) => {
    const url = new URL(request.url ?? '/', `https://${request.headers.host}`)
    const address = `${url.origin}${url.pathname}`
    if (address !== googleAuthorizeUrl && address !== appleAuthorizeUrl) {
      response.writeHead(404)
      return void response.end()
    }
    asked.push(`${address} -> ${url.searchParams.get('redirect_uri')}`)
    if (address === googleAuthorizeUrl) {
      response.writeHead(302, { location: googleAnswer(url.searchParams) })
      return void response.end()
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(appleAnswer(url.searchParams))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('No port.')

  return {
    keys: { google: google.jwks, apple: apple.jwks },
    learner,
    asked,
    googleIdToken: (email: string, nonce: string) =>
      google.signed({
        aud: testGoogleClientId,
        sub: `google-${email}`,
        email,
        email_verified: true,
        nonce
      }),
    hostRules: hosts.map(host => `MAP ${host} 127.0.0.1:${address.port}`),
    spki,
    close() {
      server.close()
      rmSync(folder, { recursive: true, force: true })
    }
  }
}
