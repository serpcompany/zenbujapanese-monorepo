'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AccessTokens } from '@/lib/account/access-tokens'
import type { HeldSubscription, Plan, Plans, Subscription } from '@/lib/account/answers'
import type { AccountApi, Failure, Result } from '@/lib/account/client'
import { type AccountText, failureMessage, isSignedOut } from '@/lib/account/messages'
import {
  accountPageUrl,
  appStoreSubscriptions,
  checkAgainAfterMs,
  detailOf,
  isShown,
  offersOnlyInTheApp,
  offersOnTheWebsite,
  priceOf,
  runsOnTheWebsite,
  shownSubscriptions
} from '@/lib/account/subscription'
import type { Locale } from '@/lib/i18n/config'
import { countOf, fill } from '@/lib/i18n/format'
import { FormMessage, Notice } from './form-message'

type Words = AccountText['subscription']

type PlansState =
  | { kind: 'loading' }
  | { kind: 'listed'; plans: Plans }
  | { kind: 'failed'; failure: Failure }

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const rowClass = 'flex min-h-24 flex-col justify-center gap-2 rounded-lg border p-4'

function HeldRow({
  held,
  running,
  locale,
  words,
  busy,
  onManage
}: {
  held: HeldSubscription
  running: boolean
  locale: Locale
  words: Words
  busy: boolean
  onManage: () => void
}) {
  const detail = detailOf(held, locale, words)
  return (
    <div className={rowClass}>
      <p className="flex flex-wrap justify-between gap-2">
        <span className="font-medium">
          {held.managedIn ? words.place[held.managedIn] : words.heading}
        </span>
        <span>{words.status[held.status]}</span>
      </p>
      {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      {running && held.managedIn === 'website' ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={busy}
            onClick={onManage}
          >
            {words.manage}
          </Button>
          <p className="text-sm text-muted-foreground">{words.manageExplained}</p>
        </>
      ) : null}
      {running && held.managedIn === 'app_store' ? (
        <>
          <p className="text-sm text-muted-foreground">{words.appStoreManaged}</p>
          <a href={appStoreSubscriptions} className="text-sm">
            {words.openAppStore}
          </a>
        </>
      ) : null}
    </div>
  )
}

function PlanRow({
  plan,
  trialDays,
  locale,
  words,
  busy,
  onSubscribe
}: {
  plan: Plan
  trialDays: number | null
  locale: Locale
  words: Words
  busy: boolean
  onSubscribe: () => void
}) {
  const price = priceOf(plan, locale, words)
  return (
    <div className={`${rowClass} sm:flex-row sm:items-center sm:justify-between`}>
      <div className="flex flex-col">
        <span className="font-medium">{plan.name}</span>
        <span>{price}</span>
        {trialDays ? (
          <span className="text-sm text-muted-foreground">
            {countOf(words.trial, trialDays, locale)}
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        className="self-start sm:self-center"
        disabled={busy}
        aria-label={fill(words.subscribeTo, { plan: `${plan.name}, ${price}` })}
        onClick={onSubscribe}
      >
        {words.subscribe}
      </Button>
    </div>
  )
}

export function SubscriptionSection({
  api,
  tokens,
  locale,
  text,
  subscription,
  returnedFromCheckout,
  waits = checkAgainAfterMs,
  onSignedOut
}: {
  api: AccountApi
  tokens: AccessTokens
  locale: Locale
  text: AccountText
  subscription: Subscription
  returnedFromCheckout: boolean
  waits?: readonly number[]
  onSignedOut: () => void
}) {
  const words = text.subscription
  const [current, setCurrent] = useState(subscription)
  const [plans, setPlans] = useState<PlansState>({ kind: 'loading' })
  const [confirming, setConfirming] = useState<'waiting' | 'slow' | null>(
    returnedFromCheckout && !runsOnTheWebsite(subscription) ? 'waiting' : null
  )
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const checkingOut = useRef(returnedFromCheckout)
  const offering = offersOnTheWebsite(current)

  useEffect(() => {
    if (!offering) return
    let live = true
    void tokens
      .use(token => api.plans(token))
      .then(listed => {
        if (!live) return
        setPlans(
          listed.ok
            ? { kind: 'listed', plans: listed.value }
            : { kind: 'failed', failure: listed.failure }
        )
      })
    return () => {
      live = false
    }
  }, [api, tokens, offering])

  useEffect(() => {
    if (!checkingOut.current) return
    checkingOut.current = false
    window.history.replaceState(null, '', accountPageUrl(locale))
    if (runsOnTheWebsite(subscription)) return
    let live = true
    void (async () => {
      for (const ms of waits) {
        await pause(ms)
        if (!live) return
        const read = await tokens.use(token => api.subscription(token))
        if (!live) return
        if (!read.ok) continue
        setCurrent(read.value)
        if (runsOnTheWebsite(read.value)) return setConfirming(null)
      }
      setConfirming('slow')
    })()
    return () => {
      live = false
    }
  }, [api, tokens, locale, subscription, waits])

  async function leaveFor(open: (token: string) => Promise<Result<string>>) {
    setBusy(true)
    setProblem(null)
    const opened = await tokens.use(open)
    if (opened.ok) return window.location.assign(opened.value)
    setBusy(false)
    if (isSignedOut(opened.failure)) return onSignedOut()
    setProblem(failureMessage(opened.failure, text.messages, locale))
  }

  if (!isShown(current)) return null
  return (
    <section aria-labelledby="subscription" className="flex flex-col gap-3">
      <h2 id="subscription" className="text-lg font-medium">
        {words.heading}
      </h2>
      <Notice>
        {confirming === 'waiting' ? words.waiting : confirming === 'slow' ? words.slow : null}
      </Notice>
      {shownSubscriptions(current).map((held, index) => (
        <HeldRow
          key={`${held.managedIn}-${index}`}
          held={held}
          running={current.running.includes(held)}
          locale={locale}
          words={words}
          busy={busy}
          onManage={() => void leaveFor(token => api.portal(token, accountPageUrl(locale)))}
        />
      ))}
      {current.running.length > 1 ? <p className="text-sm">{words.payingTwice}</p> : null}
      {offering ? (
        <>
          <p className="text-sm">{words.pitch}</p>
          {plans.kind === 'loading'
            ? current.websitePrices.map(price => (
                <div key={price} className={`${rowClass} text-sm text-muted-foreground`}>
                  {words.loadingPlans}
                </div>
              ))
            : null}
          {plans.kind === 'failed' ? (
            <FormMessage problem={failureMessage(plans.failure, text.messages, locale)} />
          ) : null}
          {plans.kind === 'listed'
            ? plans.plans.plans.map(plan => (
                <PlanRow
                  key={plan.price}
                  plan={plan}
                  trialDays={plans.plans.trialDays}
                  locale={locale}
                  words={words}
                  busy={busy}
                  onSubscribe={() =>
                    void leaveFor(token =>
                      api.checkout(token, {
                        price: plan.price,
                        successUrl: accountPageUrl(locale, '?subscribed=1'),
                        cancelUrl: accountPageUrl(locale)
                      })
                    )
                  }
                />
              ))
            : null}
          <p className="text-xs text-muted-foreground">{words.terms}</p>
        </>
      ) : null}
      {offersOnlyInTheApp(current) ? (
        <p className="text-sm text-muted-foreground">{words.inTheApp}</p>
      ) : null}
      <FormMessage problem={problem} />
    </section>
  )
}
