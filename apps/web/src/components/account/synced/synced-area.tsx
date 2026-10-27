'use client'

import type { Change } from '@zenbu/account-rules/account-copy'
import { Button } from '@zenbu/ui/components/button'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { accessTokens } from '@/lib/account/access-tokens'
import { accountApi, type Failure } from '@/lib/account/client'
import { type ItemPages, readItemPages } from '@/lib/account/item-pages'
import type { AccountText } from '@/lib/account/messages'
import { accountPages } from '@/lib/account/pages'
import type { AccountSettings } from '@/lib/account/settings'
import { onSignedInChange, rememberSignedIn, seemsSignedIn } from '@/lib/account/signed-in'
import {
  type SyncedArea as Area,
  linkedItems,
  loadSynced,
  type SyncedCopy,
  syncedAreas
} from '@/lib/account/synced'
import { changeMessage, failedMessage, signedOutBy } from '@/lib/account/synced-messages'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'
import { SignedOut } from '../account-view'
import { FormMessage, Notice } from '../form-message'
import { areaViews } from './areas'
import type { AreaProps } from './parts'

type View =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'subscription-required' }
  | { kind: 'unreachable'; failure: Failure }
  | { kind: 'shown'; copy: SyncedCopy }

interface Drawn {
  copy: SyncedCopy
  listId: string | null
  pages: ItemPages
}

function NeedsASubscription({ locale, text }: { locale: Locale; text: AccountText }) {
  return (
    <div className="flex flex-col gap-3">
      <p>{text.synced.needsSubscription}</p>
      <Link
        href={`${localizedPath(accountPages.account.path, locale)}#subscription`}
        className="self-start"
      >
        {text.synced.seeSubscription}
      </Link>
    </div>
  )
}

export function SyncedAreaView({
  area,
  locale,
  text,
  settings,
  listId = null
}: {
  area: Area
  locale: Locale
  text: AccountText
  settings: AccountSettings
  listId?: string | null
}) {
  const api = useMemo(() => accountApi(settings.apiUrl, locale), [settings.apiUrl, locale])
  const tokens = useMemo(() => accessTokens(api), [api])
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [drawn, setDrawn] = useState<Drawn | null>(null)
  const [, setRevision] = useState(0)

  const signedOut = useCallback(() => {
    tokens.forget()
    if (seemsSignedIn()) rememberSignedIn(false)
    setView({ kind: 'signed-out' })
  }, [tokens])

  const load = useCallback(async () => {
    const loaded = await loadSynced(api, tokens, syncedAreas[area])
    if (loaded.kind === 'signed-out') return signedOut()
    if (loaded.kind === 'failed') return setView({ kind: 'unreachable', failure: loaded.failure })
    if (loaded.kind === 'shown' && !seemsSignedIn()) rememberSignedIn(true)
    setView(loaded.kind === 'shown' ? { kind: 'shown', copy: loaded.copy } : loaded)
  }, [api, tokens, area, signedOut])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(
    () =>
      onSignedInChange(() => {
        if (!seemsSignedIn()) signedOut()
      }),
    [signedOut]
  )

  const photoFile = useCallback(
    (photoId: string) => tokens.use(token => api.photoFile(token, photoId)),
    [api, tokens]
  )
  const copy = view.kind === 'shown' ? view.copy : null

  useEffect(() => {
    if (!copy) return
    let current = true
    void readItemPages(linkedItems(copy, syncedAreas[area], listId)).then(pages => {
      if (current) setDrawn({ copy, listId, pages })
    })
    return () => {
      current = false
    }
  }, [copy, area, listId])

  const shown = drawn !== null && drawn.copy === copy ? drawn : null
  const settled = useCallback(
    (outcomes: Parameters<typeof changeMessage>[0][]) => {
      setRevision(revision => revision + 1)
      if (outcomes.some(signedOutBy)) signedOut()
      const problems = outcomes.flatMap(outcome => changeMessage(outcome, text, locale) ?? [])
      const done = outcomes.every(
        outcome => outcome.status === 'applied' || outcome.status === 'kept-as-new'
      )
      return { problem: problems[0] ?? null, done }
    },
    [signedOut, text, locale]
  )

  const props: AreaProps | null = shown && {
    copy: shown.copy,
    locale,
    text,
    listId: shown.listId,
    pages: shown.pages,
    change: async (entity, operation, entityId, fields, base) =>
      settled([await shown.copy.change(entity, operation, entityId, fields, base)]),
    changeAll: async (changes: Change[]) => settled(await shown.copy.changeAll(changes)),
    photoFile
  }
  const AreaView = areaViews[area]

  return (
    <div className="flex flex-col gap-6">
      <Link href={localizedPath(accountPages.account.path, locale)} className="self-start text-sm">
        {text.synced.backToAccount}
      </Link>
      {view.kind === 'loading' || (copy && !shown) ? <Notice>{text.synced.loading}</Notice> : null}
      {view.kind === 'signed-out' ? <SignedOut notice={null} locale={locale} text={text} /> : null}
      {view.kind === 'subscription-required' ? (
        <NeedsASubscription locale={locale} text={text} />
      ) : null}
      {view.kind === 'unreachable' ? (
        <div className="flex flex-col gap-3">
          <FormMessage problem={failedMessage(view.failure, text, locale)} />
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => void load()}
          >
            {text.view.tryAgain}
          </Button>
        </div>
      ) : null}
      {props ? <AreaView {...props} /> : null}
    </div>
  )
}
