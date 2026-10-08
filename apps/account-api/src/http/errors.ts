export interface ErrorBody {
  error: { code: string; message: string }
}

const codes: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'too_large',
  429: 'too_many_requests'
}

export function errorCode(status: number): string {
  return codes[status] ?? (status >= 500 ? 'internal' : 'bad_request')
}

export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } }
}

function isErrorBody(body: unknown): body is ErrorBody {
  const error = (body as Partial<ErrorBody> | null)?.error
  return typeof error === 'object' && error !== null
}

function withRetryAfter(response: Response): Response {
  const wait = response.headers.get('x-retry-after')
  if (response.status !== 429 || wait === null || response.headers.has('retry-after')) {
    return response
  }
  const headers = new Headers(response.headers)
  headers.set('retry-after', wait)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

export async function inErrorFormat(answered: Response): Promise<Response> {
  const response = withRetryAfter(answered)
  if (response.status < 400) return response
  const json = response.headers.get('content-type')?.includes('application/json') ?? false
  const body: unknown = json
    ? await response
        .clone()
        .json()
        .catch(() => null)
    : null
  if (isErrorBody(body)) return response
  const { code, message } = (body ?? {}) as { code?: unknown; message?: unknown }
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.set('content-type', 'application/json')
  return new Response(
    JSON.stringify(
      errorBody(
        typeof code === 'string' && code !== '' ? code.toLowerCase() : errorCode(response.status),
        typeof message === 'string' && message !== '' ? message : 'The request failed.'
      )
    ),
    { status: response.status, statusText: response.statusText, headers }
  )
}
