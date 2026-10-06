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
