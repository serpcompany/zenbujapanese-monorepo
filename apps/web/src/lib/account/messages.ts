import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { countOf, fill } from '@/lib/i18n/format'
import type { Failure } from './client'

export type AccountText = Dictionary['account']
export type AccountMessages = AccountText['messages']

type Refusal = keyof AccountMessages['refusals']

const refusals = new Map<string, Refusal>([
  ['invalid_otp', 'wrongCode'],
  ['otp_expired', 'codeExpired'],
  ['too_many_attempts', 'tooManyWrongCodes'],
  ['oauth_link_error', 'linkedElsewhere'],
  ['email_not_verified', 'unverified'],
  ['email_unavailable', 'emailUnavailable'],
  ['invalid_nonce', 'tookTooLong'],
  ['social_account_already_linked', 'anotherAccount'],
  ['session_not_fresh', 'confirmFirst'],
  ['sign_in_again', 'confirmFirst'],
  ['failed_to_unlink_last_account', 'onlyWay'],
  ['username_taken', 'usernameTaken'],
  ['version_conflict', 'versionConflict'],
  ['apple_authorization_needed', 'appleAuthorizationNeeded'],
  ['apple_authorization_invalid', 'appleAuthorizationInvalid'],
  ['apple_account_mismatch', 'appleAccountMismatch'],
  ['apple_unavailable', 'appleUnavailable'],
  ['already_subscribed', 'alreadySubscribed'],
  ['payment_confirming', 'paymentConfirming'],
  ['billing_unavailable', 'billingUnavailable'],
  ['no_subscription', 'noWebsiteSubscription'],
  ['unknown_price', 'unknownPrice']
])

const returnedErrors = new Map<string, Refusal>([
  ['account_not_linked', 'linkedElsewhere'],
  ['email_not_verified', 'unverified'],
  ['account_already_linked_to_different_user', 'anotherAccount'],
  ['access_denied', 'googleCancelled']
])

const secondsInAMinute = 60

function tryAgainIn(seconds: number, messages: AccountMessages, locale: Locale): string {
  const { tooManyTries } = messages
  if (seconds < secondsInAMinute) return countOf(tooManyTries.seconds, seconds, locale)
  return countOf(tooManyTries.minutes, Math.ceil(seconds / secondsInAMinute), locale)
}

export interface ProvidersHere {
  apple: boolean
  google: boolean
}

const everyProvider: ProvidersHere = { apple: true, google: true }

function signsInWithAProvider(here: ProvidersHere, messages: AccountMessages): string {
  const says = messages.signsInWithAProvider
  if (here.apple && here.google) return says.offered
  if (!here.apple && !here.google) return says.neither
  const [offered, missing] = here.apple ? ['Apple', 'Google'] : ['Google', 'Apple']
  return fill(says.oneOf, { offered, missing })
}

export function failureMessage(
  failure: Failure,
  messages: AccountMessages,
  locale: Locale,
  here: ProvidersHere = everyProvider
): string {
  if (failure.kind === 'offline') return messages.offline
  if (failure.kind === 'unexpected') return messages.somethingWentWrong
  if (failure.status === 429) {
    return failure.retryAfter
      ? tryAgainIn(failure.retryAfter, messages, locale)
      : messages.tooManyTries.wait
  }
  if (failure.code === 'account_not_linked') return signsInWithAProvider(here, messages)
  const known = refusals.get(failure.code)
  if (known) return messages.refusals[known]
  if (failure.status >= 500 || failure.message === '') return messages.somethingWentWrong
  return fill(messages.asTheServiceSays, { message: failure.message })
}

export function returnedErrorMessage(code: string, messages: AccountMessages): string {
  const known = returnedErrors.get(code.toLowerCase())
  return known ? messages.refusals[known] : messages.googleFailed
}

export const needsFreshSignIn = (failure: Failure) =>
  failure.kind === 'refused' &&
  failure.status === 403 &&
  (failure.code === 'session_not_fresh' || failure.code === 'sign_in_again')

const signedOutCodes = new Set(['unauthorized', 'sign_in_again', 'another_account'])

export const isSignedOut = (failure: Failure) =>
  failure.kind === 'refused' && failure.status === 401 && signedOutCodes.has(failure.code)
