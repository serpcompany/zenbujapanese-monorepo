'use client'

import { BookAIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useReadingAid } from '@/hooks/use-reading-aid'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { type ReadingAid, readingAids } from '@/lib/reading-aids'

export type ReadingAidsText = Dictionary['chrome']['readingAids']

function ReadingAidItem({ id, label }: { id: ReadingAid; label: string }) {
  const [shown, show] = useReadingAid(id)
  return (
    <DropdownMenuCheckboxItem checked={shown} onCheckedChange={show}>
      {label}
    </DropdownMenuCheckboxItem>
  )
}

export function ReadingAidsMenuGroup({ text }: { text: ReadingAidsText }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="flex items-center gap-1.5 text-sm font-normal text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
        <BookAIcon aria-hidden="true" />
        {text.label}
      </DropdownMenuLabel>
      {readingAids.map(aid => (
        <ReadingAidItem key={aid.id} id={aid.id} label={text[aid.id]} />
      ))}
    </DropdownMenuGroup>
  )
}

export function ReadingAidsToggle({ text }: { text: ReadingAidsText }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" />}>
        <BookAIcon aria-hidden="true" />
        <span className="sr-only">{text.label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <ReadingAidsMenuGroup text={text} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
