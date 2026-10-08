import { servedByAccountService } from '@zenbu/node-service/api-host'
import { describe, expect, test } from 'vitest'
import { useSignInService } from '../test/sign-in'
import { authPath, offeredRoutes } from './routes'

const running = useSignInService()

describe('the sign-in routes', () => {
  test.each([
    ['POST', '/v1/auth/sign-up/email'],
    ['POST', '/v1/auth/sign-in/email'],
    ['POST', '/v1/auth/update-user'],
    ['POST', '/v1/auth/change-email'],
    ['POST', '/v1/auth/delete-user'],
    ['POST', '/v1/auth/email-otp/reset-password'],
    ['POST', '/v1/auth/email-otp/request-password-reset'],
    ['POST', '/v1/auth/forget-password/email-otp'],
    ['POST', '/v1/auth/email-otp/verify-email'],
    ['POST', '/v1/auth/email-otp/check-verification-otp'],
    ['GET', '/v1/auth/error'],
    ['GET', '/v1/auth/not-a-route']
  ])("answer %s %s, which Zenbu doesn't use, with a JSON 404", async (method, path) => {
    const answer = await running.service.call(path, {
      method,
      ...(method === 'POST' ? { body: {} } : {})
    })
    expect(answer.status).toBe(404)
    expect(answer.body).toMatchObject({ error: { code: 'not_found', message: expect.any(String) } })
  })

  test('make no password identity, whatever is asked', async () => {
    await running.service.call('/v1/auth/email-otp/reset-password', {
      body: { email: 'pw@example.com', otp: '000000', password: 'a-new-password' }
    })
    const passwords = await running.service.rows(
      "select count(*)::int as n from user_identities where provider = 'credential'"
    )
    expect(passwords).toEqual([{ n: 0 }])
  })

  test('are all under a path nginx sends to the account service', () => {
    const paths = [...offeredRoutes].map(route => `${authPath}${route}`)
    expect(paths.filter(path => !servedByAccountService(path))).toEqual([])
  })
})
