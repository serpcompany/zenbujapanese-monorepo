import { TagIcon } from 'lucide-react'
import Link from 'next/link'
import { productSymbols } from '@/components/products/product-symbols'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { type Product, type ProductMark, productTypeLabel } from '@/lib/products/catalog'
import { cn } from '@/lib/utils'

function ProductMarkTile({ mark }: { mark: ProductMark }) {
  const className =
    'grid size-7 shrink-0 place-items-center rounded-md bg-muted text-[15px] font-medium text-foreground'
  if ('glyph' in mark) {
    return (
      <span
        lang="ja"
        aria-hidden="true"
        className={cn(className, mark.solid && 'bg-primary text-primary-foreground')}
      >
        {mark.glyph}
      </span>
    )
  }
  const Icon = productSymbols[mark.symbol]
  return (
    <span aria-hidden="true" className={className}>
      <Icon className="size-3.75" />
    </span>
  )
}

function ProductCardBody({ product }: { product: Product }) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <ProductMarkTile mark={product.mark} />
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold">{product.title}</h3>
        <Badge variant={product.href ? 'outline' : 'secondary'}>
          {product.href ? 'Free' : 'Coming soon'}
        </Badge>
      </div>
      <p className="text-muted-foreground">{product.description}</p>
      <ul className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
        {product.facts.map(fact => {
          const Icon = productSymbols[fact.symbol]
          return (
            <li key={fact.text} className="inline-flex items-center gap-1.5">
              <Icon aria-hidden="true" className="size-3.25" />
              {fact.text}
            </li>
          )
        })}
        <li className="inline-flex items-center gap-1.5">
          <TagIcon aria-hidden="true" className="size-3.25" />
          {productTypeLabel(product.type)}
        </li>
      </ul>
    </>
  )
}

export function ProductCard({ product, hidden }: { product: Product; hidden?: boolean }) {
  const className = 'gap-2.5 px-4.5 py-4'
  if (!product.href) {
    return (
      <Card hidden={hidden} className={className}>
        <ProductCardBody product={product} />
      </Card>
    )
  }
  return (
    <Card hidden={hidden} className={cn(className, 'relative hover:bg-muted/40')}>
      <ProductCardBody product={product} />
      <Link
        href={product.href}
        className="absolute inset-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="sr-only">{product.title}</span>
      </Link>
    </Card>
  )
}
