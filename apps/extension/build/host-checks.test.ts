import { describe, expect, it } from 'vitest'
import {
  answerSeconds,
  type Fetch,
  hostProblems,
  neverMadeCode,
  signInCodePath
} from './host-checks.ts'
import { hosts, stagingPassword } from './hosts.ts'

function answering(page: Response | Error, code: Response | Error): Fetch {
  return async url => {
    const reply = url.endsWith(signInCodePath) ? code : page
    if (reply instanceof Error) throw reply
    return reply.clone()
  }
}

const ok = () => new Response('', { status: 200 })
const invalid = () => Response.json({ error: 'invalid_code' }, { status: 401 })

describe('hostProblems', () => {
  it('passes when the page answers 200 and the code 401 invalid_code', async () => {
    expect(await hostProblems('production', answering(ok(), invalid()))).toEqual([])
  })

  it('reads an error object with a code', async () => {
    const code = Response.json({ error: { code: 'invalid_code' } }, { status: 401 })
    expect(await hostProblems('staging', answering(ok(), code))).toEqual([])
  })

  it('fails a handover page that is not 200', async () => {
    const problems = await hostProblems(
      'production',
      answering(new Response('', { status: 404 }), invalid())
    )
    expect(problems).toEqual([
      `GET ${hosts.production.website}/account/extension/ answered 404, not 200: the website has no handover page for the extension's sign-in.`
    ])
  })

  it('fails a missing route', async () => {
    const problems = await hostProblems(
      'production',
      answering(ok(), new Response('', { status: 404 }))
    )
    expect(problems).toEqual([
      `POST ${hosts.production.api}${signInCodePath} answered 404, not 401: the account service has no extension sign-in route.`
    ])
  })

  it('fails an unknown client', async () => {
    const code = Response.json({ error: 'unknown_client' }, { status: 400 })
    const problems = await hostProblems('staging', answering(ok(), code))
    expect(problems).toEqual([
      `POST ${hosts.staging.api}${signInCodePath} answered 400 unknown_client: the account service doesn't take the extension as a client.`
    ])
  })

  it('fails any other answer, naming it', async () => {
    const wrongReason = Response.json({ error: 'rate_limited' }, { status: 401 })
    expect(await hostProblems('staging', answering(ok(), wrongReason))).toEqual([
      `POST ${hosts.staging.api}${signInCodePath} answered 401 rate_limited, not 401 invalid_code.`
    ])
    const server = new Response('oops', { status: 500 })
    expect(await hostProblems('staging', answering(ok(), server))).toEqual([
      `POST ${hosts.staging.api}${signInCodePath} answered 500, not 401 invalid_code.`
    ])
  })

  it('says which request got no answer', async () => {
    const problems = await hostProblems(
      'production',
      answering(new Error('offline'), new Error('offline'))
    )
    expect(problems).toEqual([
      `GET ${hosts.production.website}/account/extension/ didn't answer: offline.`,
      `POST ${hosts.production.api}${signInCodePath} didn't answer: offline.`
    ])
  })

  it('fails a 401 whose body is not JSON', async () => {
    const code = new Response('<html>', { status: 401 })
    expect(await hostProblems('staging', answering(ok(), code))).toEqual([
      `POST ${hosts.staging.api}${signInCodePath} answered 401 with a body that isn't JSON, not 401 invalid_code.`
    ])
  })

  it('gives each request a timeout and says which host did not answer in time', async () => {
    const signals: (AbortSignal | null | undefined)[] = []
    const problems = await hostProblems('production', async (_url, init) => {
      signals.push(init?.signal)
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })
    expect(signals).toHaveLength(2)
    for (const signal of signals) {
      expect(signal).toBeInstanceOf(AbortSignal)
      expect(signal?.aborted).toBe(false)
    }
    expect(problems).toEqual([
      `GET ${hosts.production.website}/account/extension/ didn't answer in time: no answer within ${answerSeconds} s.`,
      `POST ${hosts.production.api}${signInCodePath} didn't answer in time: no answer within ${answerSeconds} s.`
    ])
  })

  it('sends the extension client and a code no service made, and nothing else', async () => {
    const seen: { url: string; init?: RequestInit }[] = []
    await hostProblems('production', async (url, init) => {
      seen.push({ url, init })
      return url.endsWith(signInCodePath) ? invalid() : ok()
    })
    expect(seen).toHaveLength(2)
    expect(seen[0]?.url).toBe(`${hosts.production.website}/account/extension/`)
    expect(Object.keys(seen[0]?.init ?? {})).toEqual(['signal'])
    expect(seen[1]?.url).toBe(`${hosts.production.api}${signInCodePath}`)
    expect(Object.keys(seen[1]?.init ?? {}).sort()).toEqual(['body', 'headers', 'method', 'signal'])
    expect(seen[1]?.init?.method).toBe('POST')
    expect(seen[1]?.init?.headers).toEqual({
      'X-Zenbu-Client': 'zenbu-extension',
      'content-type': 'application/json'
    })
    expect(seen[1]?.init?.body).toBe(JSON.stringify({ code: neverMadeCode }))
  })

  it("sends staging's password on the website request only", async () => {
    const seen: { url: string; init?: RequestInit }[] = []
    await hostProblems('staging', async (url, init) => {
      seen.push({ url, init })
      return url.endsWith(signInCodePath) ? invalid() : ok()
    })
    expect(seen[0]?.init?.headers).toEqual({
      Authorization: `Basic ${btoa(`zenbu:${stagingPassword}`)}`
    })
    expect(stagingPassword).toBe('stagingpassword')
    expect(seen[1]?.init?.headers).toEqual({
      'X-Zenbu-Client': 'zenbu-extension',
      'content-type': 'application/json'
    })
  })

  it('says staging refused the password when its website answers 401', async () => {
    const problems = await hostProblems(
      'staging',
      answering(new Response('', { status: 401 }), invalid())
    )
    expect(problems).toEqual([
      `GET ${hosts.staging.website}/account/extension/ answered 401: staging refused the password.`
    ])
  })

  it('does not say a password was refused for production', async () => {
    const problems = await hostProblems(
      'production',
      answering(new Response('', { status: 401 }), invalid())
    )
    expect(problems).toEqual([
      `GET ${hosts.production.website}/account/extension/ answered 401, not 200: the website has no handover page for the extension's sign-in.`
    ])
  })
})
