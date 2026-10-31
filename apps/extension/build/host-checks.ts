import { type Environment, hosts, stagingPassword } from './hosts.ts'

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

const handoverPath = '/account/extension/'

export const signInCodePath = '/v1/auth/sign-in/extension-code'

export const neverMadeCode = 'a-code-no-service-ever-made'

export const answerSeconds = 15

async function answer(request: Promise<Response>, ask: string): Promise<Response | string> {
  try {
    return await request
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return `${ask} didn't answer in time: no answer within ${answerSeconds} s.`
    }
    return `${ask} didn't answer: ${error instanceof Error ? error.message : String(error)}.`
  }
}

async function json(response: Response): Promise<{ body: unknown } | null> {
  try {
    return { body: await response.json() }
  } catch {
    return null
  }
}

function errorCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null
  const { error } = body
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error
    return typeof code === 'string' ? code : null
  }
  return null
}

export async function hostProblems(environment: Environment, fetcher: Fetch): Promise<string[]> {
  const { website, api } = hosts[environment]
  const problems: string[] = []
  const timeout = () => AbortSignal.timeout(answerSeconds * 1000)

  const handoverUrl = `${website}${handoverPath}`
  const handoverInit: RequestInit =
    environment === 'staging'
      ? {
          headers: { Authorization: `Basic ${btoa(`zenbu:${stagingPassword}`)}` },
          signal: timeout()
        }
      : { signal: timeout() }
  const handover = await answer(fetcher(handoverUrl, handoverInit), `GET ${handoverUrl}`)
  if (typeof handover === 'string') problems.push(handover)
  else if (environment === 'staging' && handover.status === 401) {
    problems.push(`GET ${handoverUrl} answered 401: staging refused the password.`)
  } else if (handover.status !== 200) {
    problems.push(
      `GET ${handoverUrl} answered ${handover.status}, not 200: the website has no handover page for the extension's sign-in.`
    )
  }

  const codeUrl = `${api}${signInCodePath}`
  const ask = `POST ${codeUrl}`
  const code = await answer(
    fetcher(codeUrl, {
      method: 'POST',
      headers: { 'X-Zenbu-Client': 'zenbu-extension', 'content-type': 'application/json' },
      body: JSON.stringify({ code: neverMadeCode }),
      signal: timeout()
    }),
    ask
  )
  if (typeof code === 'string') problems.push(code)
  else if (code.status === 404) {
    problems.push(
      `${ask} answered 404, not 401: the account service has no extension sign-in route.`
    )
  } else {
    const read = await json(code)
    const reason = read === null ? null : errorCode(read.body)
    if (code.status === 401 && read === null) {
      problems.push(`${ask} answered 401 with a body that isn't JSON, not 401 invalid_code.`)
    } else if (code.status === 400 && reason === 'unknown_client') {
      problems.push(
        `${ask} answered 400 unknown_client: the account service doesn't take the extension as a client.`
      )
    } else if (code.status !== 401 || reason !== 'invalid_code') {
      problems.push(
        `${ask} answered ${code.status}${reason ? ` ${reason}` : ''}, not 401 invalid_code.`
      )
    }
  }

  return problems
}
