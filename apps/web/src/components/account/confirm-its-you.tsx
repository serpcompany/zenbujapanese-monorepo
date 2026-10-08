'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { AccessTokens } from '@/lib/account/access-tokens'
import type { AccountSession } from '@/lib/account/answers'
import { type AppleCode, appleUserOf } from '@/lib/account/apple'
import type { AccountApi } from '@/lib/account/client'
import { forgetConfirming, rememberConfirming } from '@/lib/account/confirming'
import { afterSigningInAgain } from '@/lib/account/flows'
import { appleUsersOf, type SignedInAccount, signsInWith } from '@/lib/account/load'
import { accountPages } from '@/lib/account/pages'
import type { AccountSettings } from '@/lib/account/settings'
import { SignInOptions, type SignInWays } from './sign-in-options'

const otherAppleId =
  'That Apple ID is a different one from the one your account uses. Continue with the Apple ID your account uses.'

interface ConfirmItsYouProps {
  api: AccountApi
  tokens: AccessTokens
  settings: AccountSettings
  account: SignedInAccount
  appleOnly: boolean
  why: string
  onConfirmed: (
    session: AccountSession | null,
    apple: AppleCode | null,
    stillWanted: boolean
  ) => void
  onCancel: () => void
}

export function ConfirmItsYou({
  api,
  tokens,
  settings,
  account,
  appleOnly,
  why,
  onConfirmed,
  onCancel
}: ConfirmItsYouProps) {
  const ways: SignInWays = appleOnly
    ? { apple: true, google: false, email: false }
    : {
        apple: signsInWith(account, 'apple'),
        google: signsInWith(account, 'google'),
        email: signsInWith(account, 'email')
      }
  const offered =
    (ways.apple && settings.appleServicesId !== null) ||
    (ways.google && settings.google) ||
    ways.email
  const appleUsers = appleUsersOf(account)
  const wanted = useRef(true)

  useEffect(() => {
    const backFromGoogle = (event: PageTransitionEvent) => {
      if (event.persisted) forgetConfirming()
    }
    window.addEventListener('pageshow', backFromGoogle)
    return () => window.removeEventListener('pageshow', backFromGoogle)
  }, [])

  return (
    <section
      aria-label="Confirm it’s you"
      className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4"
    >
      <h3 className="font-medium">Confirm it’s you</h3>
      <p className="text-sm text-muted-foreground">{why}</p>
      {offered ? (
        <SignInOptions
          api={api}
          settings={settings}
          ways={ways}
          email={account.profile.email}
          verb="Continue"
          emailLabels={{ send: 'Email me a code', signIn: 'Confirm' }}
          googleReturn={{ done: accountPages.account.path, failed: accountPages.account.path }}
          refuseApple={authorization =>
            appleUsers.includes(appleUserOf(authorization.idToken) ?? '') ? null : otherAppleId
          }
          beforeGoogle={() => {
            if (wanted.current) rememberConfirming(account.session)
            return wanted.current
          }}
          onSignedIn={async apple => {
            const session = await afterSigningInAgain(api, tokens, account.session)
            const sameAccount = session === null || session.userId === account.session.userId
            onConfirmed(session, apple, wanted.current && sameAccount)
          }}
        />
      ) : (
        <p className="text-sm">
          This site can’t confirm it’s you the way your account signs in, so it can’t make this
          change here yet.
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => {
          wanted.current = false
          onCancel()
        }}
      >
        Cancel
      </Button>
    </section>
  )
}
