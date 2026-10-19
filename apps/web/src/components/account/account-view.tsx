'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Fill } from '@/components/fill'
import { Button } from '@/components/ui/button'
import { accessTokens } from '@/lib/account/access-tokens'
import type { AccountSession } from '@/lib/account/answers'
import { accountApi, type Failure } from '@/lib/account/client'
import { forgetConfirming } from '@/lib/account/confirming'
import { afterGoogleConfirmation, signOutOfThisBrowser } from '@/lib/account/flows'
import { isFresh, loadAccount, type SignedInAccount } from '@/lib/account/load'
import { type AccountText, failureMessage, returnedErrorMessage } from '@/lib/account/messages'
import { accountPages } from '@/lib/account/pages'
import type { AccountSettings } from '@/lib/account/settings'
import {
  initialsOf,
  onSignedInChange,
  rememberSignedIn,
  seemsSignedIn
} from '@/lib/account/signed-in'
import { appStoreSubscriptions } from '@/lib/account/subscription'
import type { Locale } from '@/lib/i18n/config'
import { fill } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
import { DeleteAccount } from './delete-account'
import { FormMessage, Notice } from './form-message'
import { ProfileForm } from './profile-form'
import { SignInWaysSection } from './sign-in-ways'
import { SubscriptionSection } from './subscription-section'

interface Landed {
  madeANewAccount: boolean
  email: string
}

type View =
  | { kind: 'loading' }
  | { kind: 'unreachable'; failure: Failure }
  | { kind: 'signed-out'; notice: string | null }
  | { kind: 'deleted'; appStoreSubscriptionContinues: boolean }
  | { kind: 'signed-in'; account: SignedInAccount; landed: Landed | null }

interface Words {
  locale: Locale
  text: AccountText
}

function SignedOut({ notice, locale, text }: Words & { notice: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      <Notice>{notice}</Notice>
      <p>{text.view.notSignedIn}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          render={<Link href={localizedPath(accountPages.signIn.path, locale)} />}
        >
          {text.signIn}
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={localizedPath(accountPages.register.path, locale)} />}
        >
          {text.createAnAccount}
        </Button>
      </div>
    </div>
  )
}

const madeWithinMs = 60_000

function landedElsewhere({ session, profile }: SignedInAccount): Landed {
  const madeANewAccount =
    Math.abs(Date.parse(profile.createdAt) - session.signedInAt) < madeWithinMs
  return { madeANewAccount, email: session.email }
}

function landedNotice(landed: Landed | null, text: AccountText): string | null {
  if (!landed) return null
  const said = landed.madeANewAccount ? text.view.madeANewAccount : text.view.inAnotherAccount
  return fill(said, { email: landed.email })
}

function withTheNewerProfile(shown: View, loaded: SignedInAccount): SignedInAccount {
  if (shown.kind !== 'signed-in') return loaded
  const { profile } = shown.account
  return profile.id === loaded.profile.id && profile.version > loaded.profile.version
    ? { ...loaded, profile }
    : loaded
}

export function AccountView({
  locale,
  text,
  settings,
  returnedError,
  returnedFromCheckout = false,
  checkAgainAfterMs
}: Words & {
  settings: AccountSettings
  returnedError: string | null
  returnedFromCheckout?: boolean
  checkAgainAfterMs?: readonly number[]
}) {
  const api = useMemo(() => accountApi(settings.apiUrl, locale), [settings.apiUrl, locale])
  const tokens = useMemo(() => accessTokens(api), [api])
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [signOutProblem, setSignOutProblem] = useState<string | null>(null)
  const [confirmedHere, setConfirmedHere] = useState(0)
  const signOutsHere = useRef(0)

  const signedOut = useCallback(
    (notice: string | null) => {
      tokens.forget()
      rememberSignedIn(false)
      setView({ kind: 'signed-out', notice })
    },
    [tokens]
  )

  const load = useCallback(async () => {
    const signOutsBefore = signOutsHere.current
    const loaded = await loadAccount(api, tokens)
    if (loaded.kind === 'signed-out' || signOutsHere.current !== signOutsBefore) {
      forgetConfirming()
      return signedOut(null)
    }
    if (loaded.kind === 'failed') {
      return setView({ kind: 'unreachable', failure: loaded.failure })
    }
    const { session } = loaded.account
    const confirmation = afterGoogleConfirmation(api, session)
    if (confirmation === 'this-account') setConfirmedHere(Date.now())
    setView(current => ({
      kind: 'signed-in',
      account: withTheNewerProfile(current, loaded.account),
      landed: confirmation === 'another-account' ? landedElsewhere(loaded.account) : null
    }))
  }, [api, tokens, signedOut])

  const update = useCallback(
    (change: (account: SignedInAccount) => SignedInAccount) =>
      setView(current =>
        current.kind === 'signed-in' ? { ...current, account: change(current.account) } : current
      ),
    []
  )

  useEffect(
    () =>
      onSignedInChange(() => {
        if (!seemsSignedIn()) signOutsHere.current += 1
      }),
    []
  )

  useEffect(() => {
    void load()
  }, [load])

  const shownInitials =
    view.kind === 'signed-in'
      ? initialsOf(view.account.profile.name, view.account.profile.email)
      : null
  useEffect(() => {
    if (shownInitials === null) return
    rememberSignedIn(true, shownInitials)
    const stopFollowing = onSignedInChange(() => {
      if (seemsSignedIn()) return
      stopFollowing()
      signedOut(null)
    })
    return stopFollowing
  }, [shownInitials, signedOut])

  if (view.kind === 'loading') return <Notice>{text.view.loading}</Notice>
  if (view.kind === 'unreachable') {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage problem={failureMessage(view.failure, text.messages, locale)} />
        <Button type="button" variant="outline" className="self-start" onClick={() => void load()}>
          {text.view.tryAgain}
        </Button>
      </div>
    )
  }
  if (view.kind === 'signed-out') {
    return <SignedOut notice={view.notice} locale={locale} text={text} />
  }
  if (view.kind === 'deleted') {
    return (
      <div className="flex flex-col gap-3">
        <output className="flex flex-col gap-3">
          <p>{text.view.deleted}</p>
          <p className="text-sm text-muted-foreground">{text.view.goneEverywhere}</p>
          {view.appStoreSubscriptionContinues ? (
            <p className="text-sm">{text.view.appStoreStillBilling}</p>
          ) : null}
        </output>
        {view.appStoreSubscriptionContinues ? (
          <a href={appStoreSubscriptions} className="underline">
            {text.subscription.openAppStore}
          </a>
        ) : null}
        <Link href={localizedPath('/', locale)} className="underline">
          {text.view.home}
        </Link>
      </div>
    )
  }

  const { account } = view
  const shared = {
    api,
    tokens,
    locale,
    text,
    settings,
    account,
    freshNow: () => isFresh(account, confirmedHere),
    onConfirmed: (session: AccountSession | null) => {
      if (session && session.userId !== account.session.userId) return void load()
      setConfirmedHere(Date.now())
      if (session) update(current => ({ ...current, session }))
    },
    onSignedOut: () => signedOut(null)
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground">
        <Fill
          template={text.view.signedInAs}
          values={{ email: <strong className="text-foreground">{account.profile.email}</strong> }}
        />
      </p>
      <FormMessage
        problem={returnedError ? returnedErrorMessage(returnedError, text.messages) : null}
      />
      <Notice>{landedNotice(view.landed, text)}</Notice>
      <ProfileForm
        key={`profile-${account.session.userId}`}
        api={api}
        tokens={tokens}
        locale={locale}
        text={text}
        profile={account.profile}
        onChanged={profile => update(current => ({ ...current, profile }))}
        onSignedOut={shared.onSignedOut}
      />
      {account.subscription ? (
        <SubscriptionSection
          key={`subscription-${account.session.userId}`}
          api={api}
          tokens={tokens}
          locale={locale}
          text={text}
          subscription={account.subscription}
          returnedFromCheckout={returnedFromCheckout}
          waits={checkAgainAfterMs}
          onSignedOut={shared.onSignedOut}
        />
      ) : null}
      <SignInWaysSection
        key={`ways-${account.session.userId}`}
        {...shared}
        onChanged={() => void load()}
      />
      <section aria-labelledby="sign-out" className="flex flex-col gap-3">
        <h2 id="sign-out" className="text-lg font-medium">
          {text.view.signOut}
        </h2>
        <p className="text-sm text-muted-foreground">{text.view.signOutHere}</p>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={async () => {
            setSignOutProblem(null)
            const problem = await signOutOfThisBrowser(api)
            if (problem === null) return signedOut(text.view.signedOut)
            setSignOutProblem(failureMessage(problem, text.messages, locale))
          }}
        >
          {text.view.signOut}
        </Button>
        <FormMessage problem={signOutProblem} />
      </section>
      <DeleteAccount
        key={`delete-${account.session.userId}`}
        {...shared}
        onDeleted={appStoreSubscriptionContinues => {
          tokens.forget()
          rememberSignedIn(false)
          setView({ kind: 'deleted', appStoreSubscriptionContinues })
        }}
      />
    </div>
  )
}
