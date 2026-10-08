'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAppleSignIn } from '@/hooks/use-apple-sign-in'
import { useBusy } from '@/hooks/use-busy'
import type { AccessTokens } from '@/lib/account/access-tokens'
import type { AccountSession, Identity, Provider } from '@/lib/account/answers'
import type { AccountApi, Result } from '@/lib/account/client'
import { afterSigningInAgain, signedInAs } from '@/lib/account/flows'
import { type SignedInAccount, signsInWith } from '@/lib/account/load'
import { failureMessage, isSignedOut, needsFreshSignIn } from '@/lib/account/messages'
import { accountPages } from '@/lib/account/pages'
import type { AccountSettings } from '@/lib/account/settings'
import { ConfirmItsYou } from './confirm-its-you'
import { EmailCodeForm } from './email-code-form'
import { FormMessage, Notice } from './form-message'

type Pending = { kind: 'remove'; identity: Identity } | { kind: 'add'; provider: Provider } | null

const providerNames: Record<Provider, string> = {
  apple: 'Apple',
  google: 'Google',
  email: 'A code we email you'
}

const inSentence: Record<Provider, string> = { ...providerNames, email: 'a code we email you' }

interface SignInWaysProps {
  api: AccountApi
  tokens: AccessTokens
  settings: AccountSettings
  account: SignedInAccount
  freshNow: () => boolean
  onConfirmed: (session: AccountSession | null) => void
  onChanged: () => void
  onSignedOut: () => void
}

export function SignInWaysSection({
  api,
  tokens,
  settings,
  account,
  freshNow,
  onConfirmed,
  onChanged,
  onSignedOut
}: SignInWaysProps) {
  const apple = useAppleSignIn(api, settings.appleServicesId)
  const [pending, setPending] = useState<Pending>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useBusy()
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const onlyOne = account.identities.length === 1
  const addable: Provider[] = (['apple', 'google', 'email'] as const).filter(
    provider =>
      !signsInWith(account, provider) &&
      (provider === 'email' ||
        (provider === 'apple' ? settings.appleServicesId !== null : settings.google))
  )

  function settle(result: Result<unknown>) {
    setBusy(false)
    if (result.ok) {
      setPending(null)
      return onChanged()
    }
    if (isSignedOut(result.failure)) return onSignedOut()
    if (needsFreshSignIn(result.failure)) return setConfirming(true)
    setProblem(failureMessage(result.failure))
  }

  async function signedInElsewhere() {
    const signedIn = await signedInAs(api, account.session.userId)
    if (signedIn.kind === 'this-account') return false
    setBusy(false)
    if (signedIn.kind === 'failed') {
      setProblem(failureMessage(signedIn.failure))
      return true
    }
    setPending(null)
    onChanged()
    return true
  }

  async function act(action: Pending, confirmed: boolean) {
    setPending(action)
    setProblem(null)
    setNotice(null)
    if (!action) return
    if (!confirmed) return setConfirming(true)
    if (action.kind === 'remove') {
      setBusy(true)
      if (await signedInElsewhere()) return
      return settle(await api.unlink(action.identity.id))
    }
    if (action.provider === 'google') {
      setBusy(true)
      if (await signedInElsewhere()) return
      const back = `${window.location.origin}${accountPages.account.path}`
      const started = await api.startLinkingGoogle({ callbackURL: back, errorCallbackURL: back })
      if (started.ok) return window.location.assign(started.value)
      return settle(started)
    }
    if (action.provider === 'apple') {
      setBusy(true)
      const outcome = await apple.signIn()
      if (!outcome.ok) {
        setBusy(false)
        return setProblem(outcome.message)
      }
      if (await signedInElsewhere()) return
      return settle(
        await api.linkApple({
          idToken: outcome.authorization.idToken,
          nonce: outcome.nonce,
          name: null
        })
      )
    }
  }

  return (
    <section aria-labelledby="sign-in-ways" className="flex flex-col gap-3">
      <h2 id="sign-in-ways" className="text-lg font-medium">
        Ways to sign in
      </h2>
      <ul className="flex flex-col divide-y rounded-lg border">
        {account.identities.map(identity => (
          <li key={identity.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
            <span className="flex-1">
              {providerNames[identity.provider]}
              {identity.provider === 'email' ? (
                <span className="text-muted-foreground"> ({identity.subject})</span>
              ) : null}
            </span>
            {onlyOne ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={`Remove ${providerNames[identity.provider]}`}
                onClick={() => {
                  setProblem(null)
                  setPending({ kind: 'remove', identity })
                }}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      {pending?.kind === 'remove' && !confirming ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <p>
            Stop signing in with {inSentence[pending.identity.provider]}? We’ll email you that it
            was removed.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void act(pending, freshNow())}
            >
              Remove it
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPending(null)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
      {addable.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {addable.map(provider => (
            <Button
              key={provider}
              type="button"
              variant="outline"
              disabled={busy}
              onPointerEnter={provider === 'apple' ? () => void apple.prepare() : undefined}
              onFocus={provider === 'apple' ? () => void apple.prepare() : undefined}
              onTouchStart={provider === 'apple' ? () => void apple.prepare() : undefined}
              onClick={() => void act({ kind: 'add', provider }, freshNow())}
            >
              {provider === 'email' ? 'Add an email code' : `Add ${providerNames[provider]}`}
            </Button>
          ))}
        </div>
      ) : null}
      <FormMessage problem={problem} />
      <Notice>{notice}</Notice>
      {pending?.kind === 'add' && pending.provider === 'email' && !confirming ? (
        <EmailCodeForm
          api={api}
          email={account.profile.email}
          sendLabel="Email me a code"
          signInLabel="Add it"
          mayVerify={() => {
            if (freshNow()) return true
            setConfirming(true)
            return false
          }}
          onRefusal={failure => {
            if (failure.kind !== 'refused' || failure.code !== 'account_not_linked') return false
            setConfirming(true)
            return true
          }}
          onSignedIn={async () => {
            setPending(null)
            await afterSigningInAgain(api, tokens, account.session)
            onChanged()
          }}
        />
      ) : null}
      {confirming ? (
        <ConfirmItsYou
          api={api}
          tokens={tokens}
          settings={settings}
          account={account}
          appleOnly={false}
          why="Changing how you sign in needs a sign-in from the last few minutes."
          onConfirmed={(session, _apple, stillWanted) => {
            setConfirming(false)
            onConfirmed(session)
            if (!stillWanted) return
            if (pending?.kind === 'add' && pending.provider === 'apple') {
              return setNotice('Confirmed. Now choose Add Apple again.')
            }
            void act(pending, true)
          }}
          onCancel={() => {
            setConfirming(false)
            setPending(null)
          }}
        />
      ) : null}
    </section>
  )
}
