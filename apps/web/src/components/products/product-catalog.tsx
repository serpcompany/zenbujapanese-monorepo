'use client'

import { SearchIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { type MouseEvent, type ReactNode, Suspense, useEffect, useRef, useState } from 'react'
import { FeaturedAppCard } from '@/components/products/featured-app-card'
import { ProductCard } from '@/components/products/product-card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import {
  featuredApp,
  featuredAppSearchText,
  type ProductFilter,
  productFilterFor,
  productFilterFrom,
  productFilterPath,
  productFilters,
  productSearchText,
  productShown,
  products,
  productTypeParameter
} from '@/lib/products/catalog'
import { cn } from '@/lib/utils'

function useShortcutToFocus(key: string) {
  const target = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== key) return
      event.preventDefault()
      target.current?.focus()
      target.current?.select()
    }
    window.addEventListener('keydown', focus)
    return () => window.removeEventListener('keydown', focus)
  }, [key])
  return target
}

const useFilterAtAddress = () => productFilterFrom(useSearchParams().get(productTypeParameter))

const opensElsewhere = (event: MouseEvent) =>
  event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

function FilterLinks({ current }: { current: ProductFilter }) {
  const choose = (event: MouseEvent<HTMLAnchorElement>, filter: ProductFilter) => {
    if (opensElsewhere(event)) return
    event.preventDefault()
    if (filter !== current) window.history.pushState(null, '', productFilterPath(filter))
  }
  return (
    <nav aria-label="Product types">
      <ul className="flex flex-wrap justify-center gap-1.5">
        {productFilters.map(filter => (
          <li key={filter.id}>
            <a
              href={productFilterPath(filter.id)}
              aria-current={filter.id === current ? 'page' : undefined}
              onClick={event => choose(event, filter.id)}
              className={cn(
                buttonVariants({ variant: filter.id === current ? 'default' : 'outline' }),
                'rounded-full px-3',
                filter.id !== current && 'text-muted-foreground'
              )}
            >
              {filter.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function FilterLinksAtAddress() {
  return <FilterLinks current={useFilterAtAddress()} />
}

function CatalogSearch({ query, onChange }: { query: string; onChange: (query: string) => void }) {
  const input = useShortcutToFocus('k')
  return (
    <search className="w-full max-w-md">
      <InputGroup className="h-11 bg-background">
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={input}
          type="search"
          value={query}
          onChange={event => onChange(event.target.value)}
          placeholder="Search products…"
          aria-label="Search products"
          aria-keyshortcuts="Meta+K Control+K"
          className="text-[15px] [&::-webkit-search-cancel-button]:hidden"
        />
        <InputGroupAddon align="inline-end" className="pointer-coarse:hidden">
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </InputGroupAddon>
      </InputGroup>
    </search>
  )
}

type ResultsProps = { query: string; onClear: () => void }

function CatalogResults({ filter, query, onClear }: ResultsProps & { filter: ProductFilter }) {
  const heading = productFilterFor(filter)
  const appShown = productShown(
    { type: featuredApp.type, searchText: featuredAppSearchText },
    filter,
    query
  )
  const shown = products.map(product =>
    productShown({ type: product.type, searchText: productSearchText(product) }, filter, query)
  )
  const count = shown.filter(Boolean).length + (appShown ? 1 : 0)
  return (
    <section aria-labelledby="catalog-heading" className="flex w-full flex-col gap-4 text-left">
      <div className="flex flex-col gap-1">
        <h2 id="catalog-heading" className="text-lg font-semibold tracking-tight">
          {heading.title}
        </h2>
        <p className="text-[15px] text-muted-foreground">{heading.description}</p>
      </div>
      <output className="sr-only">{count === 1 ? '1 product' : `${count} products`}</output>
      <div hidden={count === 0} className="grid gap-4 md:grid-cols-2">
        <FeaturedAppCard hidden={!appShown} />
        {products.map((product, index) => (
          <ProductCard key={product.id} product={product} hidden={!shown[index]} />
        ))}
      </div>
      {count === 0 ? (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyTitle className="font-normal text-muted-foreground">
              No products match “{query}”.
            </EmptyTitle>
          </EmptyHeader>
          <Button variant="outline" size="lg" onClick={onClear}>
            Clear search
          </Button>
        </Empty>
      ) : null}
    </section>
  )
}

function CatalogResultsAtAddress(props: ResultsProps) {
  return <CatalogResults filter={useFilterAtAddress()} {...props} />
}

export function ProductCatalog({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  const results = { query, onClear: () => setQuery('') }
  return (
    <>
      <header className="flex w-full flex-col items-center gap-4.5">
        {children}
        <CatalogSearch query={query} onChange={setQuery} />
        <Suspense fallback={<FilterLinks current="all" />}>
          <FilterLinksAtAddress />
        </Suspense>
      </header>
      <Suspense fallback={<CatalogResults filter="all" {...results} />}>
        <CatalogResultsAtAddress {...results} />
      </Suspense>
    </>
  )
}
