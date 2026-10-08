import { describe, expect, test } from 'vitest'
import { refusedWith as refused } from '@/test/account-answers'
import { failureMessage, isSignedOut, needsFreshSignIn, returnedErrorMessage } from './messages'

describe('what the account pages say when the account service refuses', () => {
  test.each([
    [refused(400, 'invalid_otp'), 'That code isn’t right'],
    [refused(400, 'otp_expired'), 'That code has expired'],
    [refused(403, 'too_many_attempts'), 'Too many wrong codes'],
    [refused(403, 'account_not_linked'), 'signs in with Apple or Google'],
    [refused(401, 'oauth_link_error'), 'An account already uses that email'],
    [refused(503, 'email_unavailable'), 'isn’t available right now'],
    [refused(401, 'invalid_nonce'), 'That took too long'],
    [refused(403, 'sign_in_again'), 'confirm it’s you'],
    [refused(400, 'failed_to_unlink_last_account'), 'your only way to sign in'],
    [refused(409, 'username_taken'), 'username is taken'],
    [refused(400, 'apple_authorization_invalid'), 'Apple didn’t accept that'],
    [refused(400, 'apple_account_mismatch'), 'a different one'],
    [refused(503, 'apple_unavailable'), 'nothing was deleted'],
    [refused(500, 'internal'), 'Something went wrong on our side'],
    [{ kind: 'offline' } as const, 'We couldn’t reach your Zenbu account'],
    [{ kind: 'unexpected', status: 200 } as const, 'Something went wrong']
  ])('%o', (failure, says) => {
    expect(failureMessage(failure)).toContain(says)
  })

  test('says how long to wait after a 429, when the service says', () => {
    expect(failureMessage(refused(429, 'too_many_requests', { retryAfter: 1 }))).toBe(
      'Too many tries. Try again in 1 second.'
    )
    expect(failureMessage(refused(429, 'too_many_requests', { retryAfter: 125 }))).toBe(
      'Too many tries. Try again in 3 minutes.'
    )
    expect(failureMessage(refused(429, 'too_many_requests'))).toBe(
      'Too many tries. Wait a few minutes, then try again.'
    )
  })

  test("shows the service's own message for a refusal it doesn't name, such as a field's rule", () => {
    expect(
      failureMessage(
        refused(400, 'invalid_fields', {
          message: 'A username is 3 to 30 letters a to z, digits, or underscores.'
        })
      )
    ).toBe('A username is 3 to 30 letters a to z, digits, or underscores.')
  })

  test("names what went wrong when Google's sign-in comes back with an error", () => {
    expect(returnedErrorMessage('account_not_linked')).toContain('Sign in the way you made it')
    expect(returnedErrorMessage('ACCESS_DENIED')).toBe('Signing in with Google was cancelled.')
    expect(returnedErrorMessage('state_mismatch')).toBe(
      'Signing in with Google didn’t work. Try again.'
    )
  })

  test('takes a 401 as signed out only when it says the session is gone, not for a refused token or nonce', () => {
    expect(isSignedOut(refused(401, 'unauthorized'))).toBe(true)
    expect(isSignedOut(refused(401, 'sign_in_again'))).toBe(true)
    expect(isSignedOut(refused(401, 'invalid_nonce'))).toBe(false)
    expect(isSignedOut(refused(401, 'invalid_token'))).toBe(false)
  })

  test('asks for a fresh sign-in on 403 sign_in_again and session_not_fresh only', () => {
    expect(needsFreshSignIn(refused(403, 'sign_in_again'))).toBe(true)
    expect(needsFreshSignIn(refused(403, 'session_not_fresh'))).toBe(true)
    expect(needsFreshSignIn(refused(403, 'insufficient_scope'))).toBe(false)
    expect(needsFreshSignIn(refused(401, 'sign_in_again'))).toBe(false)
  })
})
