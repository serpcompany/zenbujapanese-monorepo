import type { AppScreenshot } from '@/lib/app-screenshots'

export type ProductPageSymbol =
  | 'search'
  | 'camera'
  | 'pen'
  | 'book'
  | 'languages'
  | 'tv'
  | 'list'
  | 'chart'
  | 'type'

export interface ProductDemo {
  symbol: ProductPageSymbol
  label: string
  title: string
  description: string
  screenshot: AppScreenshot
}

export interface ProductPoint {
  symbol: ProductPageSymbol
  title: string
  description: string
}
