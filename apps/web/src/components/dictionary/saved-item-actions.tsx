'use client'

import {
  CheckCircle2Icon,
  ImagePlusIcon,
  LinkIcon,
  ListPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ShareIcon,
  SmartphoneIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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
] as const satisfies readonly { action: AppAction; icon: typeof ShareIcon }[]

const ignoreClosedShareSheet = () => undefined

export function SavedItemActions({
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
      <ButtonGroup>
        <Button
          variant="outline"
          size="icon"
          aria-label={name ? fill(text.shareNamed, { name }) : text.share}
          onClick={share}
        >
          <ShareIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label={name ? fill(text.moreActionsNamed, { name }) : text.moreActions}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {learnerActions.map(({ action, icon: Icon }) => (
              <DropdownMenuItem key={action} onClick={() => dialog.open(action)}>
                <Icon />
                {text[action]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => dialog.open('openInApp')}>
              <SmartphoneIcon />
              {text.openInApp}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={copyLink}>
              <LinkIcon />
              {text.copyLink}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <LearnerDialog state={dialog} item={item} locale={locale} text={text} account={account} />
    </>
  )
}
