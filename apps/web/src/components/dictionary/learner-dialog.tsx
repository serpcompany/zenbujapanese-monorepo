'use client'

import { Sheet } from '@zenbu/ui/dictionary/sheet'
import { useCallback, useRef, useState } from 'react'
import {
  isSyncedAction,
  offersSignIn,
  type SyncedAction,
  syncedService
} from '@/lib/account/learner-items'
import type { SavedItem } from '@/lib/account/saved-item'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { type AppAction, GetAppDialog } from './get-app-dialog'
import { SyncedBody } from './synced-body'
import type { LearnerText } from './synced-props'

interface Opened {
  action: AppAction
  service: string | null
  offerSignIn: boolean
  opening: number
}

export function useLearnerDialog() {
  const openings = useRef(0)
  const [opened, setOpened] = useState<Opened | null>(null)
  const [shown, setShown] = useState<Opened | null>(null)
  const open = useCallback((action: AppAction) => {
    openings.current += 1
    const service = isSyncedAction(action) ? syncedService() : null
    const next = { action, service, offerSignIn: offersSignIn(), opening: openings.current }
    setOpened(next)
    setShown(next)
  }, [])
  const close = useCallback(() => setOpened(null), [])
  return { opened, shown, open, close }
}

type LearnerDialogState = Omit<ReturnType<typeof useLearnerDialog>, 'open'>

const titleOf = (action: SyncedAction, text: Dictionary['learner']) =>
  ({
    markKnown: text.synced.known.title,
    addToList: text.prompts.lists.title,
    addNote: text.synced.notes.title
  })[action]

export function LearnerDialog({
  state: { opened, shown, close },
  item,
  locale,
  text,
  account
}: LearnerText & { state: LearnerDialogState; item: SavedItem; locale: Locale }) {
  const onOpenChange = (open: boolean) => {
    if (!open) close()
  }
  const synced =
    shown?.service && isSyncedAction(shown.action)
      ? { action: shown.action, service: shown.service, opening: shown.opening }
      : null
  return (
    <>
      <GetAppDialog
        action={opened && !opened.service ? opened.action : null}
        offerSignIn={shown?.offerSignIn ?? false}
        locale={locale}
        text={text}
        onOpenChange={onOpenChange}
      />
      {synced ? (
        <Sheet
          open={Boolean(opened?.service)}
          onOpenChange={onOpenChange}
          title={titleOf(synced.action, text)}
          done={text.synced.done}
        >
          <SyncedBody
            key={synced.opening}
            action={synced.action}
            service={synced.service}
            item={item}
            locale={locale}
            text={text}
            account={account}
          />
        </Sheet>
      ) : null}
    </>
  )
}
