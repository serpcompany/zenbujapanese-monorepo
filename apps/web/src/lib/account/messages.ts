import type { Failure } from './client'

const somethingWentWrong = 'Something went wrong on our side. Try again in a few minutes.'
const confirmFirst = 'For your security, confirm it’s you first.'
const anotherAccount = 'That account already signs in to another Zenbu account.'
const linkedElsewhere =
  'An account already uses that email. Sign in the way you made it, then add this way on your account page.'
const unverified =
  'That Apple or Google account’s email isn’t verified, so it can’t make an account.'

const refusals: Record<string, string> = {
  invalid_otp: 'That code isn’t right. Check it and try again, or send a new one.',
  otp_expired: 'That code has expired. Send a new one.',
  too_many_attempts: 'Too many wrong codes. Send a new one.',
  account_not_linked:
    'This email’s account signs in with Apple or Google. Sign in that way, then add your email on your account page.',
  oauth_link_error: linkedElsewhere,
  email_not_verified: unverified,
  email_unavailable: 'Signing in with an email code isn’t available right now. Try again later.',
  invalid_nonce: 'That took too long. Try again.',
  social_account_already_linked: anotherAccount,
  session_not_fresh: confirmFirst,
  sign_in_again: confirmFirst,
  failed_to_unlink_last_account: 'That’s your only way to sign in, so it stays.',
  username_taken: 'That username is taken. Try another.',
  version_conflict:
    'Your profile changed in another app. Here it is now; make your change again if you still want it.',
  apple_authorization_needed:
    'Your account signs in with Apple, so continue with Apple to delete it.',
  apple_authorization_invalid: 'Apple didn’t accept that. Continue with Apple again.',
  apple_account_mismatch:
    'That Apple ID is a different one from the one your account uses. Continue with the Apple ID your account uses.',
  apple_unavailable:
    'Apple didn’t answer, so nothing was deleted. Continue with Apple again in a few minutes.'
}

const returnedErrors: Record<string, string> = {
  account_not_linked: linkedElsewhere,
  email_not_verified: unverified,
  account_already_linked_to_different_user: anotherAccount,
  access_denied: 'Signing in with Google was cancelled.'
}

function waitFor(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

export function failureMessage(failure: Failure): string {
  if (failure.kind === 'offline') {
    return 'We couldn’t reach your Zenbu account. Check your connection and try again.'
  }
  if (failure.kind === 'unexpected') return somethingWentWrong
  if (failure.status === 429) {
    return failure.retryAfter
      ? `Too many tries. Try again in ${waitFor(failure.retryAfter)}.`
      : 'Too many tries. Wait a few minutes, then try again.'
  }
  const known = refusals[failure.code]
  if (known) return known
  return failure.status >= 500 || failure.message === '' ? somethingWentWrong : failure.message
}

export const returnedErrorMessage = (code: string) =>
  returnedErrors[code.toLowerCase()] ?? 'Signing in with Google didn’t work. Try again.'

export const needsFreshSignIn = (failure: Failure) =>
  failure.kind === 'refused' &&
  failure.status === 403 &&
  (failure.code === 'session_not_fresh' || failure.code === 'sign_in_again')

const signedOutCodes = new Set(['unauthorized', 'sign_in_again', 'another_account'])

export const isSignedOut = (failure: Failure) =>
  failure.kind === 'refused' && failure.status === 401 && signedOutCodes.has(failure.code)
