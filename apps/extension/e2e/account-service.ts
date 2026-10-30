import { spawn } from 'node:child_process'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { signInIds, testApiHost, testGoogleClientId } from '../build/hosts.ts'
import {
  appleOrigin,
  googleOrigin,
  type SignInProviders,
  startSignInProviders
} from './sign-in-providers.ts'

const accountApi = join(import.meta.dirname, '..', '..', 'account-api')

const preload = pathToFileURL(join(import.meta.dirname, 'account-service-preload.mjs')).href

type Answer = { status: number; body: Record<string, unknown> }

type Mail = { to: string; text: string }

export type AccountService = {
  origin: string
  origins: string[]
  hostRules: string[]
  spki: string
  providers: SignInProviders
  mailTo(email: string): Promise<number>
  codeFor(email: string, sentBefore: number): Promise<string>
  call(path: string, bearer: string, method?: string, body?: unknown): Promise<Answer>
  websiteCode(email: string): Promise<string>
  close(): Promise<void>
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise(resolve => server.close(resolve))
  if (address === null || typeof address === 'string') throw new Error('No free port.')
  return address.port
}

async function untilHealthy(local: string, exited: () => boolean, logged: string[]) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline && !exited()) {
    const answer = await fetch(`${local}/healthz`).catch(() => null)
    if (answer?.ok) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`The account service didn't start:\n${logged.join('').slice(-2000)}`)
}

export async function startAccountService(website: string): Promise<AccountService> {
  const db = await PGlite.create()
  const postgres = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 10 })
  await postgres.start()
  const providers = await startSignInProviders()
  const port = await freePort()
  const local = `http://127.0.0.1:${port}`
  const appleKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
    type: 'pkcs8',
    format: 'pem'
  })
  const logged: string[] = []
  const service = spawn(
    process.execPath,
    ['--import', 'tsx', '--import', preload, 'src/server.ts'],
    {
      cwd: accountApi,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DATABASE_URL: `postgres://postgres@${postgres.getServerConn()}/postgres`,
        ACCOUNT_API_URL: testApiHost,
        ACCOUNT_API_SECRET: randomBytes(32).toString('hex'),
        ACCOUNT_API_EMAIL: 'dev-mailbox',
        PORT: String(port),
        ACCOUNT_API_TRUSTED_ORIGINS: website,
        GOOGLE_CLIENT_IDS: testGoogleClientId,
        APPLE_SERVICES_IDS: signInIds.production.appleServicesId,
        APPLE_TEAM_ID: 'ZENBUTEAM1',
        APPLE_KEY_ID: 'ZENBUKEY01',
        APPLE_PRIVATE_KEY: String(appleKey),
        ZENBU_TEST_PROVIDER_KEYS: JSON.stringify(providers.keys)
      }
    }
  )
  let exited = false
  service.on('exit', () => {
    exited = true
  })
  service.stdout.on('data', chunk => logged.push(String(chunk)))
  service.stderr.on('data', chunk => logged.push(String(chunk)))
  await untilHealthy(local, () => exited, logged)

  const mail = async (): Promise<Mail[]> => {
    const answer = await fetch(`${local}/dev/mail`)
    return ((await answer.json()) as { messages: Mail[] }).messages
  }
  const mailTo = async (email: string) => (await mail()).filter(({ to }) => to === email).length

  async function codeFor(email: string, sentBefore: number): Promise<string> {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const sent = (await mail()).filter(({ to }) => to === email)
      const code = sent.length > sentBefore ? /\b\d{6}\b/.exec(sent[0]?.text ?? '')?.[0] : null
      if (code) return code
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error('No new code reached the dev mailbox.')
  }

  async function call(
    path: string,
    bearer: string,
    method = 'GET',
    body: unknown = {}
  ): Promise<Answer> {
    const answer = await fetch(`${local}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${bearer}`,
        ...(method === 'GET' ? {} : { 'content-type': 'application/json' })
      },
      body: method === 'GET' ? undefined : JSON.stringify(body)
    })
    return {
      status: answer.status,
      body: (await answer.json().catch(() => ({}))) as Answer['body']
    }
  }

  async function fromTheWebsite(path: string, body: unknown, cookie = '') {
    const answer = await fetch(`${local}${path}`, {
      method: 'POST',
      headers: { origin: website, 'content-type': 'application/json', cookie },
      body: JSON.stringify(body)
    })
    if (!answer.ok) throw new Error(`${path} answered ${answer.status}: ${await answer.text()}`)
    return answer
  }

  async function websiteCode(email: string): Promise<string> {
    const { nonce } = await (await fromTheWebsite('/v1/auth/sign-in/nonce', {})).json()
    const token = providers.googleIdToken(email, nonce)
    const signedIn = await fromTheWebsite('/v1/auth/sign-in/social', {
      provider: 'google',
      idToken: { token, nonce }
    })
    const cookie = signedIn.headers
      .getSetCookie()
      .map(line => line.split(';')[0])
      .join('; ')
    const issued = await fromTheWebsite('/v1/auth/extension-code', {}, cookie)
    return String((await issued.json()).code)
  }

  return {
    origin: testApiHost,
    origins: [testApiHost, googleOrigin, appleOrigin],
    hostRules: [`MAP ${new URL(testApiHost).host} 127.0.0.1:${port}`, ...providers.hostRules],
    spki: providers.spki,
    providers,
    mailTo,
    codeFor,
    call,
    websiteCode,
    async close() {
      service.kill()
      providers.close()
      await postgres.stop()
      await db.close()
    }
  }
}
