import type { ChangeOutcome } from '@zenbu/account-rules/account-copy'
import type { Locale } from '../i18n/config'
import { fill } from '../i18n/format'
import type { Failure } from './client'
import { type AccountText, failureMessage, isSignedOut } from './messages'
import { needsASubscription } from './synced'

type Refusal = keyof AccountText['synced']['refusals']

const refusals = new Map<string, Refusal>([
  ['unknown_list', 'unknownList'],
  ['list_full', 'listFull'],
  ['too_many_lists', 'tooManyLists'],
  ['too_many_notes', 'tooManyNotes'],
  ['already_exists', 'alreadyExists'],
  ['invalid_fields', 'invalidFields']
])

export function failedMessage(failure: Failure, text: AccountText, locale: Locale): string {
  if (needsASubscription(failure)) return text.synced.needsSubscription
  return failureMessage(failure, text.messages, locale)
}

export function changeMessage(
  outcome: ChangeOutcome<Failure>,
  text: AccountText,
  locale: Locale
): string | null {
  const words = text.synced
  if (outcome.status === 'applied') return null
  if (outcome.status === 'kept-as-new') return words.notes.keptAsNew
  if (outcome.status === 'conflict') return words.changedElsewhere
  if (outcome.status === 'failed') return failedMessage(outcome.failure, text, locale)
  const known = refusals.get(outcome.code)
  return known ? words.refusals[known] : fill(words.refusals.other, { message: outcome.message })
}

export const signedOutBy = (outcome: ChangeOutcome<Failure>) =>
  outcome.status === 'failed' && isSignedOut(outcome.failure)
