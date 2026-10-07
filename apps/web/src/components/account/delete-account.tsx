'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AccessTokens } from '@/lib/account/access-tokens'
import type { AccountApi } from '@/lib/account/client'
import { type SignedInAccount, signsInWith } from '@/lib/account/load'
import { failureMessage, isSignedOut, needsFreshSignIn } from '@/lib/account/messages'
import type { AccountSettings } from '@/lib/account/settings'
import { ConfirmItsYou } from './confirm-its-you'
import { FormMessage } from './form-message'
import type { AppleCode } from './sign-in-options'

type Step = 'closed' | 'confirm' | 'confirm-identity' | 'deleting'

const appleElsewhere =
  'Your account signs in with Apple, which this site can’t confirm yet. Delete it in the Zenbu Japanese app.'

interface DeleteAccountProps {
  api: AccountApi
  tokens: AccessTokens
  settings: AccountSettings
  account: SignedInAccount
  freshNow: () => boolean
  onConfirmed: () => void
  onDeleted: () => void
  onSignedOut: () => void
}

export function DeleteAccount({
  api,
  tokens,
  settings,
  account,
  freshNow,
  onConfirmed,
  onDeleted,
  onSignedOut
}: DeleteAccountProps) {
  const [step, setStep] = useState<Step>('closed')
  const [problem, setProblem] = useState<string | null>(null)
  const appleConfirms = signsInWith(account, 'apple') && settings.appleServicesId !== null

  async function remove(apple: AppleCode | null) {
    setStep('deleting')
    setProblem(null)
    const deleted = await tokens.use(token =>
      api.deleteAccount(
        token,
        apple ? { appleAuthorizationCode: apple.code, appleRedirectUri: apple.returnUrl } : null
      )
    )
    if (deleted.ok) {
      void api.signOut()
      return onDeleted()
    }
    const { failure } = deleted
    if (isSignedOut(failure)) return onSignedOut()
    const appleRefused = failure.kind === 'refused' && failure.code.startsWith('apple_')
    setProblem(appleRefused && !appleConfirms ? appleElsewhere : failureMessage(failure))
    setStep(
      needsFreshSignIn(failure) || (appleRefused && appleConfirms) ? 'confirm-identity' : 'confirm'
    )
  }

  return (
    <section aria-labelledby="delete-account" className="flex flex-col gap-3">
      <h2 id="delete-account" className="text-lg font-medium">
        Delete your account
      </h2>
      <p className="text-sm text-muted-foreground">
        Deleting your account removes it, its ways to sign in, and everything it synced, from every
        Zenbu app, at once. Each device keeps its own data and keeps working signed out. This can’t
        be undone.
      </p>
      {step === 'closed' ? (
        <Button
          type="button"
          variant="destructive"
          className="self-start"
          onClick={() => setStep('confirm')}
        >
          Delete account
        </Button>
      ) : null}
      {step === 'confirm' || step === 'deleting' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4">
          <p className="text-sm">
            Delete <strong>{account.profile.email}</strong> and everything it synced?
          </p>
          <FormMessage problem={problem} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={step === 'deleting'}
              onClick={() => {
                if (appleConfirms || !freshNow()) {
                  setProblem(null)
                  return setStep('confirm-identity')
                }
                void remove(null)
              }}
            >
              Delete my account
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep('closed')}>
              Keep my account
            </Button>
          </div>
        </div>
      ) : null}
      {step === 'confirm-identity' ? (
        <>
          <FormMessage problem={problem} />
          <ConfirmItsYou
            api={api}
            tokens={tokens}
            settings={settings}
            account={account}
            appleOnly={appleConfirms}
            why={
              appleConfirms
                ? 'Your account signs in with Apple, so Apple confirms it’s you and we stop its access to your Apple ID.'
                : 'Deleting needs a sign-in from the last few minutes.'
            }
            onConfirmed={apple => {
              onConfirmed()
              void remove(apple)
            }}
            onCancel={() => setStep('closed')}
          />
        </>
      ) : null}
    </section>
  )
}
