import type { Failure, Result } from '@/lib/account/client'

export const jwtFor = (claims: object, head = 'head') =>
  `${head}.${btoa(JSON.stringify(claims)).replaceAll('=', '')}.sig`

export const idTokenFor = (sub: string) => jwtFor({ sub })

export const refusedWith = (status: number, code: string, extra: Partial<Failure> = {}) =>
  ({
    kind: 'refused',
    status,
    code,
    message: '',
    retryAfter: null,
    current: null,
    ...extra
  }) as Failure

export const refusedResult = (status: number, code: string): Result<never> => ({
  ok: false,
  failure: refusedWith(status, code)
})
