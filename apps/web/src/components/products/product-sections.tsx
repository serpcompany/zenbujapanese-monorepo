import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ProductCard } from '@/components/products/product-card'
import { productSymbols } from '@/components/products/product-symbols'
import { sectionTitleClassName } from '@/components/products/section-title'
import { QuestionList } from '@/components/question-list'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import type { CatalogProduct } from '@/lib/products/localized-catalog'
import type { ProductPoint } from '@/lib/products/product-page'
import type { Question } from '@/lib/questions'
import { linkTo } from '@/lib/site'

export function ProductPoints({ points }: { points: readonly ProductPoint[] }) {
  return (
    <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {points.map(point => {
        const Icon = productSymbols[point.symbol]
        return (
          <li key={point.title} className="flex flex-col gap-2">
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-lg bg-muted text-foreground"
            >
              <Icon className="size-4" />
            </span>
            <h3 className="mt-1 font-semibold">{point.title}</h3>
            <p className="text-[15px] text-muted-foreground">{point.description}</p>
          </li>
        )
      })}
    </ul>
  )
}

export function ProductQuestions({
  questions,
  locale
}: {
  questions: readonly Question[]
  locale: Locale
}) {
  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className={sectionTitleClassName}>
        {getDictionary(locale).productPage.questionsHeading}
      </h2>
      <QuestionList questions={questions} openFirst className="max-w-2xl text-left" />
    </div>
  )
}

export function MoreProducts({
  products,
  locale
}: {
  products: readonly CatalogProduct[]
  locale: Locale
}) {
  const text = getDictionary(locale).productPage.more
  const allProducts = linkTo('products')
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{text.heading}</h2>
        <Link
          href={localizedPath(allProducts.href, locale)}
          data-link-target={allProducts.target}
          className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          {text.all}
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  )
}

export function ProductBand({ children }: { children: ReactNode }) {
  return <section className="border-y bg-muted/50 py-12 md:py-14">{children}</section>
}
