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
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { type AppAction, GetAppDialog } from './get-app-dialog'

const prompts = {
  lists: { action: 'addToList', icon: ListPlusIcon },
  notes: { action: 'addNote', icon: PencilIcon }
} as const satisfies Record<string, { action: AppAction; icon: typeof PencilIcon }>

export function LearnerPrompt({
  kind,
  locale,
  text
}: {
  kind: keyof typeof prompts
  locale: Locale
  text: Dictionary['learner']
}) {
  const [action, setAction] = useState<AppAction | null>(null)
  const { action: opens, icon: Icon } = prompts[kind]
  const { title, description } = text.prompts[kind]
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
          <Button variant="outline" size="sm" onClick={() => setAction(opens)}>
            {title}
          </Button>
        </ItemActions>
      </Item>
      <GetAppDialog
        action={action}
        locale={locale}
        text={text}
        onOpenChange={open => !open && setAction(null)}
      />
    </>
  )
}
