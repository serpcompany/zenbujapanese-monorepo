'use client'

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  type LucideIcon,
  MoreHorizontalIcon,
  ShareIcon
} from 'lucide-react'
import { Fragment, useState } from 'react'
import { Button } from '../components/button'
import { ButtonGroup } from '../components/button-group'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../components/dropdown-menu'

export interface SavedItemAction {
  id: string
  icon: LucideIcon
  label: string
  onSelect: () => void
}

export interface SavedItemPage {
  id: string
  icon: LucideIcon
  label: string
  title: string
  back: string
  choices: { id: string; label: string; checked: boolean }[]
  onChoose: (id: string, checked: boolean) => void
  actions: SavedItemAction[]
}

export interface SavedItemStatus {
  label: string
  value: string
  choices: { value: string; label: string }[]
  onValueChange: (value: string) => void
}

type SavedItemEntry = SavedItemAction | SavedItemPage

const isPage = (entry: SavedItemEntry): entry is SavedItemPage => 'choices' in entry

function ActionItem({ action }: { action: SavedItemAction }) {
  const { icon: Icon, label, onSelect } = action
  return (
    <DropdownMenuItem onClick={onSelect}>
      <Icon />
      {label}
    </DropdownMenuItem>
  )
}

function StatusChoices({ status }: { status: SavedItemStatus }) {
  return (
    <DropdownMenuRadioGroup
      value={status.value}
      onValueChange={(value: string) => status.onValueChange(value)}
    >
      <DropdownMenuLabel>{status.label}</DropdownMenuLabel>
      {status.choices.map(choice => (
        <DropdownMenuRadioItem key={choice.value} value={choice.value} closeOnClick>
          {choice.label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

function PageChoices({ page, back }: { page: SavedItemPage; back: () => void }) {
  return (
    <>
      <DropdownMenuItem closeOnClick={false} onClick={back}>
        <ChevronLeftIcon />
        {page.back}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{page.title}</DropdownMenuLabel>
        {page.choices.map(choice => (
          <DropdownMenuCheckboxItem
            key={choice.id}
            checked={choice.checked}
            onCheckedChange={(checked: boolean) => page.onChoose(choice.id, checked)}
          >
            {choice.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuGroup>
      {page.actions.length > 0 ? <DropdownMenuSeparator /> : null}
      {page.actions.map(action => (
        <ActionItem key={action.id} action={action} />
      ))}
    </>
  )
}

function EntryItem({ entry, open }: { entry: SavedItemEntry; open: (page: string) => void }) {
  if (!isPage(entry)) return <ActionItem action={entry} />
  const { icon: Icon, label } = entry
  return (
    <DropdownMenuItem closeOnClick={false} onClick={() => open(entry.id)}>
      <Icon />
      {label}
      <ChevronRightIcon className="ml-auto" />
    </DropdownMenuItem>
  )
}

export function SavedItemActions({
  share,
  moreActions,
  status,
  groups
}: {
  share: { label: string; onSelect: () => void }
  moreActions: string
  status?: SavedItemStatus
  groups: SavedItemEntry[][]
}) {
  const [opened, setOpened] = useState<string | null>(null)
  const page = groups.flat().find(entry => isPage(entry) && entry.id === opened)
  return (
    <ButtonGroup>
      <Button variant="outline" size="icon" aria-label={share.label} onClick={share.onSelect}>
        <ShareIcon />
      </Button>
      <DropdownMenu onOpenChange={open => (open ? undefined : setOpened(null))}>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon" aria-label={moreActions} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {page && isPage(page) ? (
            <PageChoices page={page} back={() => setOpened(null)} />
          ) : (
            <>
              {status ? <StatusChoices status={status} /> : null}
              {groups.map((group, index) => (
                <Fragment key={group.map(entry => entry.id).join()}>
                  {index > 0 || status ? <DropdownMenuSeparator /> : null}
                  {group.map(entry => (
                    <EntryItem key={entry.id} entry={entry} open={setOpened} />
                  ))}
                </Fragment>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}
