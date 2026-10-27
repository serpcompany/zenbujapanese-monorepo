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
import { toast } from 'sonner'
import type { SavedItem } from '@/lib/account/saved-item'
import type { Locale } from '@/lib/i18n/config'
import { fill } from '@/lib/i18n/format'
import type { AppAction } from './get-app-dialog'
import { LearnerDialog, useLearnerDialog } from './learner-dialog'
import type { LearnerText } from './synced-props'

const learnerActions = [
  { action: 'markKnown', icon: CheckCircle2Icon },
  { action: 'addToList', icon: ListPlusIcon },
  { action: 'addNote', icon: PencilIcon },
  { action: 'addPhoto', icon: ImagePlusIcon }
] as const satisfies readonly { action: AppAction; icon: typeof LinkIcon }[]

const ignoreClosedShareSheet = () => undefined

export function SiteItemActions({
  title,
  shareText,
  path,
  name,
  item,
  locale,
  text,
  account
}: LearnerText & {
  title: string
  shareText: string
  path?: string
  name?: string
  item: SavedItem
  locale: Locale
}) {
  const dialog = useLearnerDialog()
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
            onSelect: () => dialog.open(shown)
          })),
          [
            {
              id: 'openInApp',
              icon: SmartphoneIcon,
              label: text.openInApp,
              onSelect: () => dialog.open('openInApp')
            },
            { id: 'copyLink', icon: LinkIcon, label: text.copyLink, onSelect: copyLink }
          ]
        ]}
      />
      <LearnerDialog state={dialog} item={item} locale={locale} text={text} account={account} />
    </>
  )
}
