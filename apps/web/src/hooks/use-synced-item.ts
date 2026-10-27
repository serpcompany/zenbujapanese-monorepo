'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { accessTokens } from '@/lib/account/access-tokens'
import { accountApi } from '@/lib/account/client'
import type { Attempt } from '@/lib/account/learner-items'
import { rememberSignedIn } from '@/lib/account/signed-in'
import {
  type KindRead,
  type LoadedSynced,
  loadSynced,
  needsASubscription,
  type SyncedCopy
} from '@/lib/account/synced'
import { changeMessage, type SyncedText, signedOutBy } from '@/lib/account/synced-messages'
import type { Locale } from '@/lib/i18n/config'

type SyncedView = { kind: 'loading' } | LoadedSynced

export interface SyncedItem {
  view: SyncedView
  busy: boolean
  message: string | null
  retry: () => void
  run: (
    attempt: (copy: SyncedCopy) => Promise<Attempt>,
    rule?: string
  ) => Promise<Attempt['status'] | null>
}

export function useSyncedItem({
  service,
  reads,
  locale,
  text
}: {
  service: string
  reads: readonly KindRead[]
  locale: Locale
  text: SyncedText
}): SyncedItem {
  const api = useMemo(() => accountApi(service, locale), [service, locale])
  const tokens = useMemo(() => accessTokens(api), [api])
  const [view, setView] = useState<SyncedView>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [, setChanges] = useState(0)

  const show = useCallback((loaded: LoadedSynced) => {
    if (loaded.kind === 'signed-out') rememberSignedIn(false)
    setView(loaded)
  }, [])

  const load = useCallback(() => {
    setView({ kind: 'loading' })
    setMessage(null)
    return loadSynced(api, tokens, reads)
  }, [api, tokens, reads])

  useEffect(() => {
    let shown = true
    void load().then(loaded => shown && show(loaded))
    return () => {
      shown = false
    }
  }, [load, show])

  const retry = useCallback(() => void load().then(show), [load, show])

  const run = useCallback(
    async (attempt: (copy: SyncedCopy) => Promise<Attempt>, rule?: string) => {
      if (view.kind !== 'shown' || busy) return null
      setBusy(true)
      setMessage(null)
      const outcome = await attempt(view.copy)
      setBusy(false)
      setChanges(count => count + 1)
      if (outcome.status === 'not-sent') setMessage(rule ?? null)
      else if (signedOutBy(outcome)) show({ kind: 'signed-out' })
      else if (outcome.status === 'failed' && needsASubscription(outcome.failure)) {
        show({ kind: 'subscription-required' })
      } else setMessage(changeMessage(outcome, text, locale))
      return outcome.status
    },
    [view, busy, show, text, locale]
  )

  return { view, busy, message, retry, run }
}
