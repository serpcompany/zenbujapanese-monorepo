import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
const require = createRequire(join(resolve(process.env.PUPPETEER_DIR), 'package.json'))
const puppeteer = require('puppeteer-core')
const here = new URL('.', import.meta.url).pathname
const id = process.argv[2]
const api = 'http://localhost:8790'
const out = {}
const profile = mkdtempSync(join(resolve(process.env.PROFILE_ROOT), 'chrome-'))
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME,
  headless: process.env.HEADFUL ? false : true,
  userDataDir: profile,
  enableExtensions: [join(here, 'ext')],
  pipe: true,
  args: ['--no-first-run']
})
out.chrome = await browser.version()
const target = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().startsWith(`chrome-extension://${id}/`))
const worker = await target.worker()
const sw = (fn, ...args) => worker.evaluate(fn, ...args)
for (let i = 0; i < 50 && !(await sw(() => typeof globalThis.redirectURL === 'function')); i++) await new Promise(r => setTimeout(r, 100))
const codes = async email => {
  const mail = await (await fetch(`${api}/dev/mail`)).json()
  return mail.messages.filter(m => m.to === email).map(m => (m.text.match(/\b(\d{6})\b/) ?? [])[1]).reverse()
}
out.redirectURL = await sw(() => redirectURL())
out.headersFromWorker = await sw(() => fetch('http://127.0.0.1:3997/echo', { method: 'POST', body: '{}' }).then(r => r.json()))
out.nonceFromWorker = await sw(() => call('/v1/auth/sign-in/nonce', { method: 'POST', body: {} }))
const email = `spike-${Date.now()}@example.com`
out.sendCodeFromWorker = await sw(e => call('/v1/auth/email-otp/send-verification-otp', { method: 'POST', body: { email: e, type: 'sign-in' } }), email)
const page = await browser.newPage()
await page.goto(`chrome-extension://${id}/page.html`)
await page.waitForFunction(() => typeof window.call === 'function')
out.sendCodeFromExtensionPage = await page.evaluate(e => call('/v1/auth/email-otp/send-verification-otp', { method: 'POST', body: { email: e, type: 'sign-in' } }), email)
if (out.sendCodeFromWorker.status !== 200) {
  out.sendCodeFromCurlNoOrigin = execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', `${api}/v1/auth/email-otp/send-verification-otp`, '-H', 'content-type: application/json', '-H', 'x-zenbu-client: zenbu-extension', '-H', 'cf-connecting-ip: 10.9.9.9', '-d', JSON.stringify({ email, type: 'sign-in' })]).toString()
}
const tried = await codes(email)
out.codeArrived = tried.length > 0
if (!tried.length) { console.log(JSON.stringify(out, null, 2)); await browser.close(); process.exit(0) }
let signIn
for (const otp of tried) {
  signIn = await sw((e, o) => call('/v1/auth/sign-in/email-otp', { method: 'POST', body: { email: e, otp: o } }), email, otp)
  if (signIn.status === 200) break
}
out.signInFromWorker = { status: signIn.status, error: signIn.json?.error, sessionTokenVisible: Boolean(signIn.sessionToken), setCookieVisible: signIn.setCookieVisible, userId: signIn.json?.user?.id }
if (signIn.sessionToken) {
  const session = signIn.sessionToken
  const token = await sw(s => call('/v1/auth/token', { headers: { authorization: `Bearer ${s}` } }), session)
  out.accessToken = { status: token.status }
  const access = token.json?.token
  if (access) {
    const claims = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString())
    out.accessToken.claims = { azp: claims.azp, scope: claims.scope }
    const bearer = { authorization: `Bearer ${access}` }
    const listId = crypto.randomUUID()
    const mutations = [
      { id: 'm-known-1', entity: 'knownWord', operation: 'mark', entityId: '9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90', baseVersion: 0, fields: { headword: '見る', reading: 'みる' } },
      { id: 'm-known-kanji', entity: 'knownWord', operation: 'mark', entityId: 'kanji:見', baseVersion: 0, fields: {} },
      { id: 'm-list-1', entity: 'list', operation: 'create', entityId: listId, baseVersion: 0, fields: { name: 'Favorites', position: 0 } },
      { id: 'm-listword-1', entity: 'listWord', operation: 'add', entityId: `${listId}/9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90`, baseVersion: 0, fields: { headword: '見る', reading: 'みる' } },
      { id: 'm-note-1', entity: 'wordNote', operation: 'write', entityId: crypto.randomUUID(), baseVersion: 0, fields: { item: '9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90', text: 'seen on a page', headword: '見る', reading: 'みる' } },
      { id: 'm-watch-1', entity: 'watchedVideo', operation: 'watch', entityId: 'dQw4w9WgXcQ', baseVersion: 0, fields: { watchedAt: new Date().toISOString(), title: 'A video', position: 12, comprehension: 0.73 } },
      { id: 'm-watch-netflix', entity: 'watchedVideo', operation: 'watch', entityId: '81234567', baseVersion: 0, fields: { watchedAt: new Date().toISOString() } },
      { id: 'm-setting-1', entity: 'setting', operation: 'set', entityId: 'readingAids.furigana', baseVersion: 0, fields: { value: true } },
      { id: 'm-setting-src', entity: 'setting', operation: 'set', entityId: 'readingAids.translationSource', baseVersion: 0, fields: { value: 'apple' } },
      { id: 'm-bookmark-1', entity: 'bookmarkedSentence', operation: 'add', entityId: crypto.randomUUID(), baseVersion: 0, fields: { text: 'こんにちは', translation: 'hello', language: 'ja', bookmarkedAt: new Date().toISOString() } }
    ]
    const sync = await sw((h, m) => call('/v1/sync', { method: 'POST', headers: h, body: { mutations: m } }), bearer, mutations)
    out.sync = { status: sync.status, results: sync.json?.results?.map(r => `${r.id}: ${r.status} ${JSON.stringify(r.error ?? r.code ?? "")}`), changes: sync.json?.changes?.map(c => `${c.entity} ${c.operation}`), error: sync.json?.error }
    const sub = await sw(h => call('/v1/me/subscription', { headers: h }), bearer)
    out.subscription = { status: sub.status, cloudAccess: sub.json?.cloudAccess, canSubscribe: sub.json?.canSubscribe, keys: sub.json && Object.keys(sub.json) }
    const me = await sw(h => call('/v1/me', { headers: h }), bearer)
    out.meWithoutProfile = { status: me.status, code: me.json?.error?.code }
    if (process.env.DELETE) {
      const gone = await sw(h => call('/v1/me', { method: 'DELETE', headers: h, body: { confirm: true } }), bearer)
      out.deleteAccount = { status: gone.status, json: gone.json }
      const after = await sw(s => call('/v1/auth/token', { headers: { authorization: `Bearer ${s}` } }), session)
      out.tokenAfterDelete = after.status
    }
    const out1 = await sw(s => call('/v1/auth/sign-out', { method: 'POST', headers: { authorization: `Bearer ${s}` }, body: {} }), session)
    out.signOut = { status: out1.status, json: out1.json }
  }
}
const content = await browser.newPage()
await content.goto('http://127.0.0.1:3997/page')
await content.waitForFunction(() => document.documentElement.dataset.contentScriptFetch, { timeout: 10000 }).catch(() => null)
out.contentScriptFetch = await content.evaluate(() => document.documentElement.dataset.contentScriptFetch ?? 'no result')
const flow = path => sw(u => authFlow(u), `http://127.0.0.1:3997${path}?state=s1`)
out.authFlowFragment = await flow('/fragment')
out.authFlowFormPost = await Promise.race([flow('/form-post'), new Promise(r => setTimeout(() => r('no answer in 15 s'), 15000))])
out.authFlowFormPostThroughBridge = await flow('/form-post-bridge')
console.log(JSON.stringify(out, null, 2))
await browser.close()
