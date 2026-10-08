'use client'

import { useState } from 'react'
import { useAppleSignIn } from '@/hooks/use-apple-sign-in'
import { useBusy } from '@/hooks/use-busy'
import type { AppleAuthorization, AppleCode } from '@/lib/account/apple'
import type { AccountApi } from '@/lib/account/client'
import { failureMessage } from '@/lib/account/messages'
import type { AccountSettings } from '@/lib/account/settings'
import { EmailCodeForm } from './email-code-form'
import { FormMessage } from './form-message'
import { AppleButton, GoogleButton } from './provider-buttons'

export interface SignInWays {
  apple: boolean
  google: boolean
  email: boolean
}

interface SignInOptionsProps {
  api: AccountApi
  settings: AccountSettings
  ways: SignInWays
  email?: string
  verb: string
  emailLabels: { send: string; signIn: string }
  googleReturn: { done: string; failed: string }
  refuseApple?: (authorization: AppleAuthorization) => string | null
  beforeGoogle?: () => boolean
  onSignedIn: (apple: AppleCode | null) => void | Promise<void>
}

export function SignInOptions({
  api,
  settings,
  ways,
  email,
  verb,
  emailLabels,
  googleReturn,
  refuseApple,
  beforeGoogle,
  onSignedIn
}: SignInOptionsProps) {
  const apple = useAppleSignIn(api, settings.appleServicesId)
  const [busy, setBusy] = useBusy()
  const [problem, setProblem] = useState<string | null>(null)
  const offersApple = ways.apple && settings.appleServicesId !== null
  const offersGoogle = ways.google && settings.google

  async function withApple() {
    setBusy(true)
    setProblem(null)
    const outcome = await apple.signIn()
    if (!outcome.ok) {
      setBusy(false)
      return setProblem(outcome.message)
    }
    const refused = refuseApple?.(outcome.authorization) ?? null
    if (refused) {
      setBusy(false)
      return setProblem(refused)
    }
    const { authorization, nonce, returnUrl } = outcome
    const signedIn = await api.signInWithApple({
      idToken: authorization.idToken,
      nonce,
      name: authorization.name
    })
    if (signedIn.ok) await onSignedIn({ code: authorization.code, returnUrl })
    else setProblem(failureMessage(signedIn.failure))
    setBusy(false)
  }

  async function withGoogle() {
    setBusy(true)
    setProblem(null)
    const origin = window.location.origin
    const started = await api.startGoogle({
      callbackURL: `${origin}${googleReturn.done}`,
      errorCallbackURL: `${origin}${googleReturn.failed}`
    })
    if (!started.ok) {
      setBusy(false)
      return setProblem(failureMessage(started.failure))
    }
    if (beforeGoogle && !beforeGoogle()) return setBusy(false)
    window.location.assign(started.value)
  }

  return (
    <div className="flex flex-col gap-4">
      {offersApple || offersGoogle ? (
        <div className="flex flex-col gap-2">
          {offersApple ? (
            <AppleButton
              label={`${verb} with Apple`}
              busy={busy}
              onIntent={() => void apple.prepare()}
              onClick={() => void withApple()}
            />
          ) : null}
          {offersGoogle ? (
            <GoogleButton
              label={`${verb} with Google`}
              busy={busy}
              onClick={() => void withGoogle()}
            />
          ) : null}
          <FormMessage problem={problem} />
        </div>
      ) : null}
      {(offersApple || offersGoogle) && ways.email ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}
      {ways.email ? (
        <EmailCodeForm
          api={api}
          email={email}
          sendLabel={emailLabels.send}
          signInLabel={emailLabels.signIn}
          providersHere={{ apple: settings.appleServicesId !== null, google: settings.google }}
          onSignedIn={() => onSignedIn(null)}
        />
      ) : null}
    </div>
  )
}
