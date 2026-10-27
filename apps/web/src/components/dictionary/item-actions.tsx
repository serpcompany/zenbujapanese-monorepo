'use client'

import { SavedItemActions } from '@zenbu/ui/dictionary/saved-item-actions'
import {
  CheckCircle2Icon,
  ImagePlusIcon,
  LinkIcon,
  ListPlusIcon,
  PencilIcon,
  SmartphoneIcon
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { type AppAction, GetAppDialog } from './get-app-dialog'

const learnerActions = [
  { action: 'markKnown', icon: CheckCircle2Icon },
  { action: 'addToList', icon: ListPlusIcon },
  { action: 'addNote', icon: PencilIcon },
  { action: 'addPhoto', icon: ImagePlusIcon }
] as const satisfies readonly { action: AppAction; icon: typeof LinkIcon }[]

const ignoreClosedShareSheet = () => undefined

export function ItemActions({
  title,
  shareText,
  path,
  name,
  locale,
  text
}: {
  title: string
  shareText: string
  path?: string
  name?: string
  locale: Locale
  text: Dictionary['learner']
}) {
  const [action, setAction] = useState<AppAction | null>(null)
  const link = () => (path ? new URL(path, window.location.href).href : window.location.href)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link())
      toast.success(text.linkCopied)
    } catch {
      toast.error(text.copyFailed)
    }
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({ title, text: shareText, url: link() }).catch(ignoreClosedShareSheet)
      return
    }
    await copyLink()
  }

  return (
    <>
      <SavedItemActions
        share={{ label: name ? fill(text.shareNamed, { name }) : text.share, onSelect: share }}
        moreActions={name ? fill(text.moreActionsNamed, { name }) : text.moreActions}
        groups={[
          learnerActions.map(({ action: shown, icon }) => ({
            id: shown,
            icon,
            label: text[shown],
            onSelect: () => setAction(shown)
          })),
          [
            {
              id: 'openInApp',
              icon: SmartphoneIcon,
              label: text.openInApp,
              onSelect: () => setAction('openInApp')
            },
            { id: 'copyLink', icon: LinkIcon, label: text.copyLink, onSelect: copyLink }
          ]
        ]}
      />
      <GetAppDialog
        action={action}
        locale={locale}
        text={text}
        onOpenChange={open => !open && setAction(null)}
      />
    </>
  )
}
