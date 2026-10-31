import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@zenbu/ui/components/item'
import { ChevronRight, type LucideIcon } from 'lucide-react'

type PageRowProps = {
  icon: LucideIcon
  title: string
  count?: number
  onOpen(): void
}

export function PageRow({ icon: Icon, title, count, onOpen }: PageRowProps) {
  return (
    <Item
      variant="outline"
      render={<button type="button" onClick={onOpen} />}
      className="w-full cursor-pointer text-left"
    >
      <ItemMedia variant="icon">
        <Icon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
      </ItemContent>
      <ItemActions>
        {count !== undefined && (
          <span data-count className="text-sm text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
        <ChevronRight className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  )
}
