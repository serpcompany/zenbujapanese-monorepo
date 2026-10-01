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
import { useState } from 'react'
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
import { GetAppDialog } from './get-app-dialog'

const learnerActions = [
  { label: 'Mark as Known', icon: CheckCircle2Icon },
  { label: 'Add to List…', icon: ListPlusIcon },
  { label: 'Add Note', icon: PencilIcon },
  { label: 'Add Photo', icon: ImagePlusIcon }
]

const ignoreClosedShareSheet = () => undefined

export function SavedItemActions({
  title,
  shareText,
  path,
  name
}: {
  title: string
  shareText: string
  path?: string
  name?: string
}) {
  const [action, setAction] = useState<string | null>(null)
  const link = () => (path ? new URL(path, window.location.href).href : window.location.href)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link())
      toast.success('Link copied')
    } catch {
      toast.error("Couldn't copy the link. Copy it from the address bar.")
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
          aria-label={name ? `Share ${name}` : 'Share'}
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
                aria-label={name ? `More actions for ${name}` : 'More actions'}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {learnerActions.map(({ label, icon: Icon }) => (
              <DropdownMenuItem key={label} onClick={() => setAction(label.replace('…', ''))}>
                <Icon />
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setAction('Open in App')}>
              <SmartphoneIcon />
              Open in App
            </DropdownMenuItem>
            <DropdownMenuItem onClick={copyLink}>
              <LinkIcon />
              Copy Link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <GetAppDialog action={action} onOpenChange={open => !open && setAction(null)} />
    </>
  )
}
