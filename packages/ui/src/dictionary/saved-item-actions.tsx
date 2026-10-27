'use client'

import { type LucideIcon, MoreHorizontalIcon, ShareIcon } from 'lucide-react'
import { Fragment } from 'react'
import { Button } from '../components/button'
import { ButtonGroup } from '../components/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../components/dropdown-menu'

export interface SavedItemAction {
  id: string
  icon: LucideIcon
  label: string
  onSelect: () => void
}

export function SavedItemActions({
  share,
  moreActions,
  groups
}: {
  share: { label: string; onSelect: () => void }
  moreActions: string
  groups: SavedItemAction[][]
}) {
  return (
    <ButtonGroup>
      <Button variant="outline" size="icon" aria-label={share.label} onClick={share.onSelect}>
        <ShareIcon />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon" aria-label={moreActions} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {groups.map((group, index) => (
            <Fragment key={group.map(action => action.id).join()}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              {group.map(({ id, icon: Icon, label, onSelect }) => (
                <DropdownMenuItem key={id} onClick={onSelect}>
                  <Icon />
                  {label}
                </DropdownMenuItem>
              ))}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}
