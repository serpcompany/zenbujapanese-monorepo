'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AccessTokens } from '@/lib/account/access-tokens'
import type { AccountSession } from '@/lib/account/answers'
import type { AppleCode } from '@/lib/account/apple'
import type { AccountApi } from '@/lib/account/client'
import { deleteTheAccount } from '@/lib/account/flows'
import { type SignedInAccount, signsInWith } from '@/lib/account/load'
import { failureMessage } from '@/lib/account/messages'
import type { AccountSettings } from '@/lib/account/settings'
import { ConfirmItsYou } from './confirm-its-you'
import { FormMessage } from './form-message'

type Step = 'closed' | 'confirm' | 'confirm-identity' | 'deleting'

const appleElsewhere =
  'Your account signs in with Apple, which this site can’t confirm yet. Delete it in the Zenbu Japanese app.'

interface DeleteAccountProps {
  api: AccountApi
  tokens: AccessTokens
  settings: AccountSettings
  account: SignedInAccount
  freshNow: () => boolean
  onConfirmed: (session: AccountSession | null) => void
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
    const deletion = await deleteTheAccount(api, tokens, apple)
    if (deletion.kind === 'deleted') return onDeleted()
    if (deletion.kind === 'signed-out') return onSignedOut()
    const appleElsewhereNeeded = deletion.kind === 'refused' && deletion.byApple && !appleConfirms
    setProblem(appleElsewhereNeeded ? appleElsewhere : failureMessage(deletion.failure))
    const confirmAgain =
      deletion.kind === 'confirm-first' || (deletion.kind === 'refused' && deletion.byApple)
    setStep(confirmAgain && !appleElsewhereNeeded ? 'confirm-identity' : 'confirm')
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
            <Button
              type="button"
              variant="ghost"
              disabled={step === 'deleting'}
              onClick={() => setStep('closed')}
            >
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
            onConfirmed={(session, apple, stillWanted) => {
              onConfirmed(session)
              if (stillWanted) void remove(apple)
            }}
            onCancel={() => setStep('closed')}
          />
        </>
      ) : null}
    </section>
  )
}
