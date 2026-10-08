'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { accessTokens } from '@/lib/account/access-tokens'
import type { AccountSession } from '@/lib/account/answers'
import { accountApi } from '@/lib/account/client'
import { forgetConfirming } from '@/lib/account/confirming'
import { afterGoogleConfirmation, signOutOfThisBrowser } from '@/lib/account/flows'
import { isFresh, loadAccount, type SignedInAccount } from '@/lib/account/load'
import { failureMessage, returnedErrorMessage } from '@/lib/account/messages'
import { accountPages } from '@/lib/account/pages'
import type { AccountSettings } from '@/lib/account/settings'
import {
  initialsOf,
  onSignedInChange,
  rememberSignedIn,
  seemsSignedIn
} from '@/lib/account/signed-in'
import { DeleteAccount } from './delete-account'
import { FormMessage, Notice } from './form-message'
import { ProfileForm } from './profile-form'
import { SignInWaysSection } from './sign-in-ways'

type View =
  | { kind: 'loading' }
  | { kind: 'unreachable'; problem: string }
  | { kind: 'signed-out'; notice: string | null }
  | { kind: 'deleted' }
  | { kind: 'signed-in'; account: SignedInAccount; notice: string | null }

function SignedOut({ notice }: { notice: string | null }) {
  return (
    <div className="flex flex-col gap-4">
      <Notice>{notice}</Notice>
      <p>You’re not signed in.</p>
      <div className="flex flex-wrap gap-2">
        <Button nativeButton={false} render={<Link href={accountPages.signIn.path} />}>
          Sign in
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={accountPages.register.path} />}
        >
          Create an account
        </Button>
      </div>
    </div>
  )
}

const madeWithinMs = 60_000

function landedElsewhere({ session, profile }: SignedInAccount): string {
  const madeJustNow = Math.abs(Date.parse(profile.createdAt) - session.signedInAt) < madeWithinMs
  return madeJustNow
    ? `That Google account had no Zenbu account, so it made a new one, ${session.email}, and this browser is signed in to it now. To use your own account, sign out, then sign in to it again; Delete account below removes the new one.`
    : `That Google account signs in to another Zenbu account, so this browser is now signed in to ${session.email}.`
}

function withTheNewerProfile(shown: View, loaded: SignedInAccount): SignedInAccount {
  if (shown.kind !== 'signed-in') return loaded
  const { profile } = shown.account
  return profile.id === loaded.profile.id && profile.version > loaded.profile.version
    ? { ...loaded, profile }
    : loaded
}

export function AccountView({
  settings,
  returnedError
}: {
  settings: AccountSettings
  returnedError: string | null
}) {
  const api = useMemo(() => accountApi(settings.apiUrl), [settings.apiUrl])
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
      return setView({ kind: 'unreachable', problem: failureMessage(loaded.failure) })
    }
    const { session } = loaded.account
    const confirmation = afterGoogleConfirmation(api, session)
    if (confirmation === 'this-account') setConfirmedHere(Date.now())
    setView(current => ({
      kind: 'signed-in',
      account: withTheNewerProfile(current, loaded.account),
      notice: confirmation === 'another-account' ? landedElsewhere(loaded.account) : null
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

  if (view.kind === 'loading') return <Notice>Loading your account…</Notice>
  if (view.kind === 'unreachable') {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage problem={view.problem} />
        <Button type="button" variant="outline" className="self-start" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    )
  }
  if (view.kind === 'signed-out') return <SignedOut notice={view.notice} />
  if (view.kind === 'deleted') {
    return (
      <div className="flex flex-col gap-3">
        <output className="flex flex-col gap-3">
          <p>Your account is deleted.</p>
          <p className="text-sm text-muted-foreground">
            It’s gone from every Zenbu app. Each device keeps its own data and works signed out.
          </p>
        </output>
        <Link href="/" className="underline">
          Back to the home page
        </Link>
      </div>
    )
  }

  const { account } = view
  const shared = {
    api,
    tokens,
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
        Signed in as <strong className="text-foreground">{account.profile.email}</strong>
      </p>
      <FormMessage problem={returnedError ? returnedErrorMessage(returnedError) : null} />
      <Notice>{view.notice}</Notice>
      <ProfileForm
        key={`profile-${account.session.userId}`}
        api={api}
        tokens={tokens}
        profile={account.profile}
        onChanged={profile => update(current => ({ ...current, profile }))}
        onSignedOut={shared.onSignedOut}
      />
      <SignInWaysSection
        key={`ways-${account.session.userId}`}
        {...shared}
        onChanged={() => void load()}
      />
      <section aria-labelledby="sign-out" className="flex flex-col gap-3">
        <h2 id="sign-out" className="text-lg font-medium">
          Sign out
        </h2>
        <p className="text-sm text-muted-foreground">
          Sign out of this browser. Your other devices stay signed in.
        </p>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={async () => {
            setSignOutProblem(null)
            const problem = await signOutOfThisBrowser(api)
            if (problem === null) return signedOut('You’re signed out.')
            setSignOutProblem(failureMessage(problem))
          }}
        >
          Sign out
        </Button>
        <FormMessage problem={signOutProblem} />
      </section>
      <DeleteAccount
        key={`delete-${account.session.userId}`}
        {...shared}
        onDeleted={() => {
          tokens.forget()
          rememberSignedIn(false)
          setView({ kind: 'deleted' })
        }}
      />
    </div>
  )
}
