import {
  ArrowLeftRightIcon,
  BookOpenIcon,
  CameraIcon,
  ChartColumnIcon,
  CheckIcon,
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
  SmartphoneIcon,
  TvIcon,
  TypeIcon,
  UserXIcon
} from 'lucide-react'
import type { ProductSymbol } from '@/lib/products/catalog'
import type { ProductPageSymbol } from '@/lib/products/zenbu-japanese-for-iphone'

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
  list: ListIcon,
  'user-x': UserXIcon,
  phone: SmartphoneIcon,
  check: CheckIcon
}
