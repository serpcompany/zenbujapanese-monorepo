'use client'

import { useState } from 'react'
import { Fill } from '@/components/fill'
import { Button } from '@/components/ui/button'
import type { AccessTokens } from '@/lib/account/access-tokens'
import type { AccountSession } from '@/lib/account/answers'
import type { AppleCode } from '@/lib/account/apple'
import type { AccountApi } from '@/lib/account/client'
import { deleteTheAccount } from '@/lib/account/flows'
import { type SignedInAccount, signsInWith } from '@/lib/account/load'
import { type AccountText, failureMessage } from '@/lib/account/messages'
import type { AccountSettings } from '@/lib/account/settings'
import {
  appStoreSubscriptions,
  runsInTheAppStore,
  runsOnTheWebsite
} from '@/lib/account/subscription'
import type { Locale } from '@/lib/i18n/config'
import { ConfirmItsYou } from './confirm-its-you'
import { FormMessage } from './form-message'

type Step = 'closed' | 'confirm' | 'confirm-identity' | 'deleting'

interface DeleteAccountProps {
  api: AccountApi
  tokens: AccessTokens
  locale: Locale
  text: AccountText
  settings: AccountSettings
  account: SignedInAccount
  freshNow: () => boolean
  onConfirmed: (session: AccountSession | null) => void
  onDeleted: (appStoreSubscriptionContinues: boolean) => void
  onSignedOut: () => void
}

export function DeleteAccount({
  api,
  tokens,
  locale,
  text,
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
  const words = text.deletion

  async function remove(apple: AppleCode | null) {
    setStep('deleting')
    setProblem(null)
    const deletion = await deleteTheAccount(api, tokens, apple)
    if (deletion.kind === 'deleted') return onDeleted(deletion.appStoreSubscriptionContinues)
    if (deletion.kind === 'signed-out') return onSignedOut()
    const appleElsewhereNeeded = deletion.kind === 'refused' && deletion.byApple && !appleConfirms
    setProblem(
      appleElsewhereNeeded
        ? words.appleElsewhere
        : failureMessage(deletion.failure, text.messages, locale)
    )
    const confirmAgain =
      deletion.kind === 'confirm-first' || (deletion.kind === 'refused' && deletion.byApple)
    setStep(confirmAgain && !appleElsewhereNeeded ? 'confirm-identity' : 'confirm')
  }

  return (
    <section aria-labelledby="delete-account" className="flex flex-col gap-3">
      <h2 id="delete-account" className="text-lg font-medium">
        {words.heading}
      </h2>
      <p className="text-sm text-muted-foreground">{words.explained}</p>
      {account.subscription && runsOnTheWebsite(account.subscription) ? (
        <p className="text-sm text-muted-foreground">{words.websiteCanceled}</p>
      ) : null}
      {runsInTheAppStore(account.subscription) ? (
        <p className="text-sm">
          {words.appStoreContinues}{' '}
          <a href={appStoreSubscriptions}>{text.subscription.openAppStore}</a>
        </p>
      ) : null}
      {step === 'closed' ? (
        <Button
          type="button"
          variant="destructive"
          className="self-start"
          onClick={() => setStep('confirm')}
        >
          {words.deleteAccount}
        </Button>
      ) : null}
      {step === 'confirm' || step === 'deleting' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4">
          <p className="text-sm">
            <Fill
              template={words.sure}
              values={{ email: <strong>{account.profile.email}</strong> }}
            />
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
              {words.deleteMine}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={step === 'deleting'}
              onClick={() => setStep('closed')}
            >
              {words.keepMine}
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
            locale={locale}
            text={text}
            settings={settings}
            account={account}
            appleOnly={appleConfirms}
            why={appleConfirms ? words.appleConfirms : words.whyFresh}
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
