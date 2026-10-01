'use client'

import { ListPlusIcon, PencilIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { GetAppDialog } from './get-app-dialog'

const prompts = {
  lists: {
    title: 'Add to List',
    description: 'Save it to your lists in the Zenbu app.',
    icon: ListPlusIcon
  },
  notes: {
    title: 'Add Note',
    description: 'Write notes and attach photos in the Zenbu app.',
    icon: PencilIcon
  }
}

export function LearnerPrompt({ kind }: { kind: keyof typeof prompts }) {
  const [action, setAction] = useState<string | null>(null)
  const { title, description, icon: Icon } = prompts[kind]
  return (
    <>
      <Item className="px-0 py-0">
        <ItemMedia variant="icon">
          <Icon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{title}</ItemTitle>
          <ItemDescription>{description}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="outline" size="sm" onClick={() => setAction(title)}>
            {title}
          </Button>
        </ItemActions>
      </Item>
      <GetAppDialog action={action} onOpenChange={open => !open && setAction(null)} />
    </>
  )
}
