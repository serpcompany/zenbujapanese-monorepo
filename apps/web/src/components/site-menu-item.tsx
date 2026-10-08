import {
  ArrowLeftRightIcon,
  BookOpenIcon,
  ChartColumnIcon,
  FileTextIcon,
  LayoutGridIcon,
  ListIcon,
  type LucideIcon,
  PlayIcon,
  PuzzleIcon,
  SearchIcon,
  SmartphoneIcon,
  TagIcon,
  TypeIcon
} from 'lucide-react'
import Image from 'next/image'
import type { MenuLink, MenuSymbol } from '@/lib/site-menus'
import { cn } from '@/lib/utils'

export const menuSymbols: Record<MenuSymbol, LucideIcon> = {
  search: SearchIcon,
  chart: ChartColumnIcon,
  tag: TagIcon,
  list: ListIcon,
  grid: LayoutGridIcon,
  type: TypeIcon,
  swap: ArrowLeftRightIcon,
  book: BookOpenIcon,
  puzzle: PuzzleIcon,
  file: FileTextIcon,
  play: PlayIcon,
  phone: SmartphoneIcon
}

function MenuMark({ mark }: { mark: MenuLink['mark'] }) {
  const className =
    'grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-[15px] font-medium text-foreground group-hover/menu-item:bg-background group-hover/menu-item:ring-1 group-hover/menu-item:ring-foreground/10'
  if ('image' in mark) {
    return (
      <span aria-hidden="true" className={className}>
        <Image src={mark.image} alt="" width={32} height={32} unoptimized className="size-8" />
      </span>
    )
  }
  if ('glyph' in mark) {
    return (
      <span
        lang="ja"
        aria-hidden="true"
        className={cn(
          className,
          mark.solid &&
            'bg-primary text-primary-foreground group-hover/menu-item:bg-primary group-hover/menu-item:ring-0'
        )}
      >
        {mark.glyph}
      </span>
    )
  }
  const SymbolIcon = menuSymbols[mark.symbol]
  return (
    <span aria-hidden="true" className={className}>
      <SymbolIcon className="size-4" />
    </span>
  )
}

export const menuItemClassName = 'group/menu-item items-start gap-3'

export function SiteMenuItem({ link }: { link: MenuLink }) {
  return (
    <>
      <MenuMark mark={link.mark} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{link.title}</span>
        <span className="text-[13px] leading-snug text-muted-foreground">{link.description}</span>
      </span>
    </>
  )
}
