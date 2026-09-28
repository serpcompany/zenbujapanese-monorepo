'use client'

import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ImagePlusIcon,
  LinkIcon,
  ListPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ShareIcon,
  SmartphoneIcon
} from 'lucide-react'
import Link from 'next/link'
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

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    toast.success('Link copied')
  } catch {
    toast.error("Couldn't copy the link. Copy it from the address bar.")
  }
}

/** The word and kanji detail toolbar, as in the app: back, title, Share, and a ••• menu. */
export function PageToolbar({
  back,
  title,
  shareText
}: {
  back: { href: string; label: string }
  title: string
  shareText: string
}) {
  const [action, setAction] = useState<string | null>(null)

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: shareText, url: window.location.href })
      } catch {
        // The reader closed the share sheet.
      }
      return
    }
    await copyLink()
  }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <Button
        variant="ghost"
        className="justify-self-start px-1.5"
        nativeButton={false}
        render={<Link href={back.href} />}
      >
        <ChevronLeftIcon />
        <span lang="ja">{back.label}</span>
      </Button>
      <h1 lang="ja" className="font-semibold">
        {title}
      </h1>
      <ButtonGroup className="justify-self-end">
        <Button variant="outline" size="icon" aria-label="Share" onClick={share}>
          <ShareIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="icon" aria-label="More actions" />}
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
    </div>
  )
}
