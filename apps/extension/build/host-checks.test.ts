import { describe, expect, it } from 'vitest'
import { type Fetch, hostProblems, signInCodePath } from './host-checks.ts'
import { hosts } from './hosts.ts'

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

  it('sends the extension client and a code no service made, and nothing else', async () => {
    const seen: { url: string; init?: RequestInit }[] = []
    await hostProblems('production', async (url, init) => {
      seen.push({ url, init })
      return url.endsWith(signInCodePath) ? invalid() : ok()
    })
    expect(seen).toHaveLength(2)
    expect(seen[0]).toEqual({
      url: `${hosts.production.website}/account/extension/`,
      init: undefined
    })
    expect(seen[1]?.init?.method).toBe('POST')
    expect(seen[1]?.init?.headers).toEqual({
      'X-Zenbu-Client': 'zenbu-extension',
      'content-type': 'application/json'
    })
  })
})
