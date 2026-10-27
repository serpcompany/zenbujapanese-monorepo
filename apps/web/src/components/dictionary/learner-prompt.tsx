'use client'

import { ListPlusIcon, PencilIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import type { SavedItem } from '@/lib/account/saved-item'
import type { Locale } from '@/lib/i18n/config'
import type { AppAction } from './get-app-dialog'
import { LearnerDialog, useLearnerDialog } from './learner-dialog'
import type { LearnerText } from './synced-props'

const prompts = {
  lists: { action: 'addToList', icon: ListPlusIcon },
  notes: { action: 'addNote', icon: PencilIcon }
} as const satisfies Record<string, { action: AppAction; icon: typeof PencilIcon }>

export function LearnerPrompt({
  kind,
  item,
  locale,
  text,
  account
}: LearnerText & {
  kind: keyof typeof prompts
  item: SavedItem
  locale: Locale
}) {
  const dialog = useLearnerDialog()
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
          <Button variant="outline" size="sm" onClick={() => dialog.open(opens)}>
            {title}
          </Button>
        </ItemActions>
      </Item>
      <LearnerDialog state={dialog} item={item} locale={locale} text={text} account={account} />
    </>
  )
}
