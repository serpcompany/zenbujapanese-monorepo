import { describe, expect, test } from 'vitest'
import { googleCodeFor } from '../test/identity-provider'
import { googleClientIds, websiteOrigin } from '../test/service'
import { fromTheWebsite, sessionToken, setCookie, useSignInService } from '../test/sign-in'

const running = useSignInService({ providers: true })

const inJapanese = { 'content-language': 'ja' }
const inEnglish = { 'content-language': 'en' }
const englishCode = /^Your Zenbu Japanese code: \d{6}$/
const japaneseCode = /^Zenbu Japaneseのログインコード：\d{6}$/

async function storedLanguageOf(email: string) {
  const rows = await running.service.rows(`select language from users where email = '${email}'`)
  expect(rows).toHaveLength(1)
  return rows[0]?.language
}

async function googleOnTheWebsite(email: string) {
  const nonce = await running.as.nonce()
  const token = await running.as.idToken(running.google, googleClientIds[0], email, email, nonce)
  return { token, nonce }
}

async function linkGoogle(session: string, email: string, headers: Record<string, string>) {
  const { token, nonce } = await googleOnTheWebsite(email)
  const before = running.service.mailbox.messages().length
  const linked = await running.service.call('/v1/auth/link-social', {
    token: session,
    headers,
    body: { provider: 'google', idToken: { token, nonce } }
  })
  expect(linked.status).toBe(200)
  return running.as.lastMessageTo(email, before)
}

describe('the language of a sign-in code', () => {
  test('is English without a language, and with one the service does not know', async () => {
    const asks: Record<string, string>[] = [
      {},
      { 'content-language': 'fr' },
      { 'content-language': 'ja-JP' },
      { 'content-language': 'JA' },
      { 'content-language': 'ja, en' },
      { 'accept-language': 'ja' }
    ]
    for (const [ask, headers] of asks.entries()) {
      const message = await running.as.codeMessage(`anyone-${ask}@example.com`, headers)
      expect(message.subject, JSON.stringify(headers)).toMatch(englishCode)
    }
  })

  test("is the page's language when the website names it", async () => {
    const japanese = await running.as.codeMessage('page@example.com', {
      ...fromTheWebsite().headers,
      ...inJapanese
    })
    expect(japanese.subject).toMatch(japaneseCode)
    expect(japanese.text).toMatch(/^ログインコードは\d{6}です。/)
    const english = await running.as.codeMessage('page@example.com', {
      ...fromTheWebsite().headers,
      ...inEnglish
    })
    expect(english.subject).toMatch(englishCode)
  })
})

describe("an account's language", () => {
  test('is the one it was made with, which later emails without a language are in', async () => {
    const signedUp = await running.as.withCode('kept@example.com', { language: 'ja' })
    expect(signedUp.status).toBe(200)
    expect(await storedLanguageOf('kept@example.com')).toBe('ja')
    expect((await running.as.codeMessage('kept@example.com')).subject).toMatch(japaneseCode)
    expect((await running.as.codeMessage('kept@example.com', inEnglish)).subject).toMatch(
      englishCode
    )
    await running.as.withCode('kept@example.com', { language: 'en' })
    expect(await storedLanguageOf('kept@example.com')).toBe('ja')
  })

  test('is none for an account made without one, whose emails stay English', async () => {
    await running.as.withCode('plain@example.com')
    expect(await storedLanguageOf('plain@example.com')).toBeNull()
    expect((await running.as.codeMessage('plain@example.com')).subject).toMatch(englishCode)
  })

  test('is none for one the service does not know', async () => {
    await running.as.withCode('unknown@example.com', { language: 'fr' })
    expect(await storedLanguageOf('unknown@example.com')).toBeNull()
  })

  test('is kept from an Apple or Google sign-in on the device that names it', async () => {
    const { token, nonce } = await googleOnTheWebsite('google-ja@example.com')
    const signedIn = await running.as.withIdToken('google', token, nonce, inJapanese)
    expect(signedIn.status).toBe(200)
    expect(await storedLanguageOf('google-ja@example.com')).toBe('ja')
  })

  test("is kept through Google's web sign-in, from the page that started it", async () => {
    const started = await running.service.call('/v1/auth/sign-in/social', {
      ...fromTheWebsite(),
      headers: { ...fromTheWebsite().headers, ...inJapanese },
      body: { provider: 'google', callbackURL: `${websiteOrigin}/ja/account/` }
    })
    expect(started.status).toBe(200)
    const state = new URL(String(started.body?.url)).searchParams.get('state')
    const stateCookie = setCookie(started.headers, 'zenbu-test.state')
    expect(state && stateCookie).toBeTruthy()
    const query = new URLSearchParams({
      state: String(state),
      code: googleCodeFor('google-web-ja', 'google-web-ja@example.com')
    })
    const back = await running.service.call(`/v1/auth/callback/google?${query}`, {
      client: null,
      headers: { cookie: `zenbu-test.state=${stateCookie?.value}` }
    })
    expect(back.status).toBe(302)
    expect(back.headers.get('location')).toBe(`${websiteOrigin}/ja/account/`)
    expect(await storedLanguageOf('google-web-ja@example.com')).toBe('ja')
  })
})

describe('the notices of a way to sign in added or removed', () => {
  test("are in the account's language when the request names none", async () => {
    const signedUp = await running.as.withCode('notice-ja@example.com', { language: 'ja' })
    const notice = await linkGoogle(sessionToken(signedUp), 'notice-ja@example.com', {})
    expect(notice.subject).toBe('Zenbu Japaneseに新しいログイン方法が追加されました')
    expect(notice.text).toContain('「Googleでログイン」')
  })

  test("are in the request's language when it names one", async () => {
    const signedUp = await running.as.withCode('notice-en@example.com')
    const session = sessionToken(signedUp)
    const added = await linkGoogle(session, 'notice-en@example.com', inJapanese)
    expect(added.subject).toBe('Zenbu Japaneseに新しいログイン方法が追加されました')
    const listed = await running.service.call('/v1/auth/list-accounts', { token: session })
    const google = (listed.body as unknown as { id: string; providerId: string }[]).find(
      identity => identity.providerId === 'google'
    )
    const before = running.service.mailbox.messages().length
    const removed = await running.service.call('/v1/auth/unlink-account', {
      token: session,
      headers: inJapanese,
      body: { accountId: google?.id }
    })
    expect(removed.status).toBe(200)
    const notice = await running.as.lastMessageTo('notice-en@example.com', before)
    expect(notice.subject).toBe('Zenbu Japaneseのログイン方法が削除されました')
  })
})
