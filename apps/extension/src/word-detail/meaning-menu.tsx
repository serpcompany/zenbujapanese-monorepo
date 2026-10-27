import type { MeaningActions } from '@zenbu/dictionary-core/detail/meaning-actions'
import { fill } from '@zenbu/dictionary-core/detail/template'
import { Button } from '@zenbu/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@zenbu/ui/components/dropdown-menu'
import { speak } from '@zenbu/ui/dictionary/pronounce-button'
import { CopyIcon, MoreHorizontalIcon, Volume2Icon } from 'lucide-react'
import type { ReactNode } from 'react'
import { wordDetailLabels } from './labels'
import { copyText, type Notify } from './notice'

const englishVoice = 'en-US'

export function MeaningWithMenu({
  number,
  actions,
  meaning,
  notify
}: {
  number: number
  actions: MeaningActions
  meaning: ReactNode
  notify: Notify
}) {
  const labels = wordDetailLabels.meaning
  return (
    <div className="flex items-start gap-2" data-meaning={number}>
      <div className="min-w-0 flex-1">{meaning}</div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="-my-1"
              aria-label={fill(labels.actions, { number })}
            />
          }
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={() => speak(actions.spoken, englishVoice, labels.unsupported, notify)}
          >
            <Volume2Icon />
            {labels.speak}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void copyText(actions.copyText, labels.copied, notify)}>
            <CopyIcon />
            {labels.copy}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
