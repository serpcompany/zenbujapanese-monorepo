import { Button } from '@zenbu/ui/components/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia
} from '@zenbu/ui/components/item'
import { RefreshCw } from 'lucide-react'
import { savedWordsLabels as labels } from './labels'

export function CopyUnread({ readAgain }: { readAgain(): void }) {
  return (
    <Item variant="outline" data-sync="unread">
      <ItemMedia variant="icon">
        <RefreshCw />
      </ItemMedia>
      <ItemContent>
        <ItemDescription data-sync-note className="line-clamp-none">
          {labels.sync.unread}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm" onClick={readAgain}>
          {labels.sync.tryAgain}
        </Button>
      </ItemActions>
    </Item>
  )
}
