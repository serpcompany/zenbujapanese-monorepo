'use client'

import { Button } from '@/components/ui/button'
import type { AccessTokens } from '@/lib/account/access-tokens'
import { appleUserOf } from '@/lib/account/apple'
import type { AccountApi } from '@/lib/account/client'
import { appleUsersOf, type SignedInAccount, signsInWith } from '@/lib/account/load'
import { accountPages } from '@/lib/account/pages'
import type { AccountSettings } from '@/lib/account/settings'
import { type AppleCode, SignInOptions, type SignInWays } from './sign-in-options'

const otherAppleId =
  'That Apple ID is a different one from the one your account uses. Continue with the Apple ID your account uses.'

interface ConfirmItsYouProps {
  api: AccountApi
  tokens: AccessTokens
  settings: AccountSettings
  account: SignedInAccount
  appleOnly: boolean
  why: string
  onConfirmed: (apple: AppleCode | null) => void
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
          onSignedIn={apple => {
            void api.revokeSession(account.session.token)
            tokens.forget()
            onConfirmed(apple)
          }}
        />
      ) : (
        <p className="text-sm">
          This site can’t confirm it’s you the way your account signs in. Use the Zenbu Japanese app
          instead.
        </p>
      )}
      <Button type="button" variant="ghost" className="self-start" onClick={onCancel}>
        Cancel
      </Button>
    </section>
  )
}
