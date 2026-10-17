import { describe, expect, test, vi } from 'vitest'
import { smokeTestHeader } from './other-hosts'
import {
  basicAuthPassword,
  behindStagingAccess,
  environmentNoindex,
  passwordMatches,
  stagingAccessChallenge
} from './staging-access'

const password = 'stagingpassword'
const staging = 'https://staging.zenbujapanese.com'

const basic = (credentials: string) =>
  `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(credentials)))}`

type Asking = { headers?: Record<string, string>; method?: string; expected?: string }

function ask(path: string, asking: Asking = {}) {
  const expected = 'expected' in asking ? asking.expected : password
  const url = new URL(path, staging)
  const request = new Request(url, { headers: asking.headers, method: asking.method ?? 'GET' })
  const serve = vi.fn(
    async (forwarded: Request) =>
      new Response(`served ${forwarded.headers.get('Authorization') ?? 'without authorization'}`, {
        headers: { 'Cache-Control': 'public, max-age=60' }
      })
  )
  return { response: behindStagingAccess(request, url, expected, serve), serve }
}

describe('basicAuthPassword', () => {
  test.each([
    [basic('staging:stagingpassword'), 'stagingpassword'],
    [basic(':stagingpassword'), 'stagingpassword'],
    [basic('anyone:pass:with:colons'), 'pass:with:colons'],
    [`basic ${btoa('x:stagingpassword')}`, 'stagingpassword'],
    [basic('ユーザー:パスワード'), 'パスワード']
  ])('reads the password of %s', (header, expected) => {
    expect(basicAuthPassword(header)).toBe(expected)
  })

  test.each([
    [null],
    [''],
    ['Bearer abc'],
    [basic('no-colon')],
    ['Basic not base64!'],
    ['Basic']
  ])('finds no password in %s', header => {
    expect(basicAuthPassword(header)).toBeNull()
  })
})

describe('passwordMatches', () => {
  test('matches only the same password', async () => {
    expect(await passwordMatches('stagingpassword', 'stagingpassword')).toBe(true)
    expect(await passwordMatches('stagingpasswor', 'stagingpassword')).toBe(false)
    expect(await passwordMatches('stagingpassword!', 'stagingpassword')).toBe(false)
    expect(await passwordMatches('', 'stagingpassword')).toBe(false)
  })
})

describe('behindStagingAccess', () => {
  test('asks for the password, and serves nothing, when a request has none', async () => {
    const { response, serve } = ask('/dictionary/')
    const refused = await response
    expect(refused.status).toBe(401)
    expect(refused.headers.get('WWW-Authenticate')).toBe(stagingAccessChallenge)
    expect(stagingAccessChallenge).toBe('Basic realm="zenbujapanese staging", charset="UTF-8"')
    expect(refused.headers.get('Cache-Control')).toBe('no-store')
    expect(refused.headers.get('X-Robots-Tag')).toBe(environmentNoindex)
    expect(await refused.text()).toBe('Staging asks for a password.\n')
    expect(serve).not.toHaveBeenCalled()
  })

  test('answers a HEAD request it refuses with no body', async () => {
    const refused = await ask('/', { method: 'HEAD' }).response
    expect(refused.status).toBe(401)
    expect(refused.body).toBeNull()
  })

  test('refuses a wrong password, whatever the username', async () => {
    for (const credentials of ['staging:wrong', 'staging:', 'stagingpassword:x']) {
      const { response, serve } = ask('/', { headers: { Authorization: basic(credentials) } })
      expect((await response).status).toBe(401)
      expect(serve).not.toHaveBeenCalled()
    }
  })

  test('serves the password with any username, without its Authorization and with no noindex', async () => {
    for (const credentials of ['staging:stagingpassword', ':stagingpassword']) {
      const { response, serve } = ask('/dictionary/', {
        headers: { Authorization: basic(credentials) }
      })
      const passed = await response
      expect(passed.status).toBe(200)
      expect(await passed.text()).toBe('served without authorization')
      expect(passed.headers.get('X-Robots-Tag')).toBeNull()
      expect(passed.headers.get('Cache-Control')).toBe('public, max-age=60')
      expect(serve).toHaveBeenCalledOnce()
    }
  })

  test('keeps a page its own X-Robots-Tag once the password passed', async () => {
    const url = new URL('/dictionary/service.json', staging)
    const request = new Request(url, { headers: { Authorization: basic('x:stagingpassword') } })
    const passed = await behindStagingAccess(request, url, password, async () =>
      Response.json({}, { headers: { 'X-Robots-Tag': 'noindex' } })
    )
    expect(passed.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  test('fails closed without its password variable', async () => {
    for (const expected of [undefined, '']) {
      const { response, serve } = ask('/', {
        headers: { Authorization: basic('staging:stagingpassword') },
        expected
      })
      expect((await response).status).toBe(401)
      expect(serve).not.toHaveBeenCalled()
    }
  })

  test('serves robots.txt without the password, with noindex', async () => {
    const withAndWithoutAWrongPassword: Record<string, string>[] = [
      {},
      { Authorization: basic('staging:wrong') }
    ]
    for (const headers of withAndWithoutAWrongPassword) {
      for (const method of ['GET', 'HEAD']) {
        const { response, serve } = ask('/robots.txt', { headers, method })
        const exempt = await response
        expect(exempt.status).toBe(200)
        expect(exempt.headers.get('X-Robots-Tag')).toBe(environmentNoindex)
        expect(serve).toHaveBeenCalledOnce()
      }
    }
  })

  test('asks for the password on any other robots.txt request', async () => {
    for (const path of ['/robots.txt/', '/robots.txt.bak', '/ROBOTS.TXT']) {
      expect((await ask(path).response).status, path).toBe(401)
    }
    expect((await ask('/robots.txt', { method: 'POST' }).response).status).toBe(401)
  })

  test("serves the smoke test's header without the password, with noindex", async () => {
    const { response, serve } = ask('/', { headers: { [smokeTestHeader]: '1' } })
    const exempt = await response
    expect(exempt.status).toBe(200)
    expect(exempt.headers.get('X-Robots-Tag')).toBe(environmentNoindex)
    expect(serve).toHaveBeenCalledOnce()
  })

  test("checks a password sent with the smoke test's header", async () => {
    const wrong = ask('/', {
      headers: { [smokeTestHeader]: '1', Authorization: basic('staging:wrong') }
    })
    expect((await wrong.response).status).toBe(401)
    const right = await ask('/', {
      headers: { [smokeTestHeader]: '1', Authorization: basic('staging:stagingpassword') }
    }).response
    expect(right.status).toBe(200)
    expect(right.headers.get('X-Robots-Tag')).toBeNull()
  })
})
