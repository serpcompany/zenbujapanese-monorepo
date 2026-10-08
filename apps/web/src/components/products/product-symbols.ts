import {
  ArrowLeftRightIcon,
  BookOpenIcon,
  CameraIcon,
  ChartColumnIcon,
  FileTextIcon,
  GlobeIcon,
  LanguagesIcon,
  LayoutGridIcon,
  ListIcon,
  type LucideIcon,
  PenLineIcon,
  PlayIcon,
  PuzzleIcon,
  SearchIcon,
  TvIcon,
  TypeIcon
} from 'lucide-react'
import type { ProductSymbol } from '@/lib/products/catalog'
import type { ProductPageSymbol } from '@/lib/products/product-page'

export const productSymbols: Record<ProductSymbol | ProductPageSymbol, LucideIcon> = {
  puzzle: PuzzleIcon,
  chart: ChartColumnIcon,
  swap: ArrowLeftRightIcon,
  file: FileTextIcon,
  play: PlayIcon,
  globe: GlobeIcon,
  book: BookOpenIcon,
  type: TypeIcon,
  grid: LayoutGridIcon,
  tv: TvIcon,
  search: SearchIcon,
  camera: CameraIcon,
  pen: PenLineIcon,
  languages: LanguagesIcon,
  list: ListIcon
}
