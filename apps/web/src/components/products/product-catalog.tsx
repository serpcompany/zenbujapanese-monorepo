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
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { countOf, fill } from '@/lib/i18n/format'
import {
  type ProductFilter,
  productFilterFrom,
  productFilterPath,
  productShown,
  productTypeParameter
} from '@/lib/products/catalog'
import type { Catalog, CatalogFilter } from '@/lib/products/localized-catalog'
import { cn } from '@/lib/utils'

type CatalogText = Dictionary['products']['catalog'] & { getTheApp: string }

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

type FilterLinksProps = { filters: readonly CatalogFilter[]; locale: Locale; label: string }

function FilterLinks({
  current,
  filters,
  locale,
  label
}: FilterLinksProps & { current: ProductFilter }) {
  const choose = (event: MouseEvent<HTMLAnchorElement>, filter: ProductFilter) => {
    if (opensElsewhere(event)) return
    event.preventDefault()
    if (filter !== current) window.history.pushState(null, '', productFilterPath(filter, locale))
  }
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap justify-center gap-1.5">
        {filters.map(filter => (
          <li key={filter.id}>
            <a
              href={productFilterPath(filter.id, locale)}
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

function FilterLinksAtAddress(props: FilterLinksProps) {
  return <FilterLinks current={useFilterAtAddress()} {...props} />
}

function CatalogSearch({
  query,
  onChange,
  text
}: {
  query: string
  onChange: (query: string) => void
  text: CatalogText
}) {
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
          placeholder={text.searchPlaceholder}
          aria-label={text.search}
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

type ResultsProps = {
  query: string
  onClear: () => void
  catalog: Catalog
  locale: Locale
  text: CatalogText
}

function CatalogResults({
  filter,
  query,
  onClear,
  catalog,
  locale,
  text
}: ResultsProps & { filter: ProductFilter }) {
  const heading = catalog.filters.find(candidate => candidate.id === filter) ?? catalog.filters[0]
  const appShown = productShown(catalog.featuredApp, filter, query)
  const shown = catalog.products.map(product => productShown(product, filter, query))
  const count = shown.filter(Boolean).length + (appShown ? 1 : 0)
  return (
    <section aria-labelledby="catalog-heading" className="flex w-full flex-col gap-4 text-left">
      <div className="flex flex-col gap-1">
        <h2 id="catalog-heading" className="text-lg font-semibold tracking-tight">
          {heading.title}
        </h2>
        <p className="text-[15px] text-muted-foreground">{heading.description}</p>
      </div>
      <output className="sr-only">{countOf(text.count, count, locale)}</output>
      <div hidden={count === 0} className="grid gap-4 md:grid-cols-2">
        <FeaturedAppCard app={catalog.featuredApp} locale={locale} text={text} hidden={!appShown} />
        {catalog.products.map((product, index) => (
          <ProductCard key={product.id} product={product} hidden={!shown[index]} />
        ))}
      </div>
      {count === 0 ? (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyTitle className="font-normal text-muted-foreground">
              {fill(text.noMatch, { query })}
            </EmptyTitle>
          </EmptyHeader>
          <Button variant="outline" size="lg" onClick={onClear}>
            {text.clear}
          </Button>
        </Empty>
      ) : null}
    </section>
  )
}

function CatalogResultsAtAddress(props: ResultsProps) {
  return <CatalogResults filter={useFilterAtAddress()} {...props} />
}

export function ProductCatalog({
  children,
  catalog,
  locale,
  text
}: {
  children: ReactNode
  catalog: Catalog
  locale: Locale
  text: CatalogText
}) {
  const [query, setQuery] = useState('')
  const results = { query, onClear: () => setQuery(''), catalog, locale, text }
  const filterLinks = { filters: catalog.filters, locale, label: text.types }
  return (
    <>
      <header className="flex w-full flex-col items-center gap-4.5">
        {children}
        <CatalogSearch query={query} onChange={setQuery} text={text} />
        <Suspense fallback={<FilterLinks current="all" {...filterLinks} />}>
          <FilterLinksAtAddress {...filterLinks} />
        </Suspense>
      </header>
      <Suspense fallback={<CatalogResults filter="all" {...results} />}>
        <CatalogResultsAtAddress {...results} />
      </Suspense>
    </>
  )
}
