import { fields } from '../../shared/messages'

const extensionClient = 'zenbu-extension'

export type Call = {
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  body?: unknown
  bearer?: string
  signIn?: boolean
}

export type Answered =
  | { ok: true; status: number; value: Record<string, unknown>; sessionToken: string | null }
  | { ok: false; status: number; code: string; retryAfter: number | null }

export type Api = (call: Call) => Promise<Answered>

export type Send = (url: string, init: RequestInit) => Promise<Response>

export const networkFailure: Answered = {
  ok: false,
  status: 0,
  code: 'network',
  retryAfter: null
}

function secondsOf(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null
  return Number(value.trim())
}

function headersOf(call: Call): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Language': 'en',
    ...(call.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(call.bearer === undefined ? {} : { Authorization: `Bearer ${call.bearer}` }),
    ...(call.signIn ? { 'X-Zenbu-Client': extensionClient } : {})
  }
}

async function answerOf(response: Response): Promise<Answered> {
  const value = fields(await response.json().catch(() => undefined))
  if (value === undefined) return networkFailure
  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      value,
      sessionToken: response.headers.get('set-auth-token')
    }
  }
  const code = fields(value.error)?.code
  const retryAfter =
    response.status === 429
      ? (secondsOf(response.headers.get('retry-after')) ??
        secondsOf(response.headers.get('x-retry-after')))
      : null
  return {
    ok: false,
    status: response.status,
    code: typeof code === 'string' ? code : `status_${response.status}`,
    retryAfter
  }
}

export function accountApi(origin: string, send: Send = (url, init) => fetch(url, init)): Api {
  return async call => {
    const response = await send(`${origin}${call.path}`, {
      method: call.method,
      headers: headersOf(call),
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error'
    }).catch(() => undefined)
    return response === undefined ? networkFailure : answerOf(response)
  }
}
