import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ProductCard } from '@/components/products/product-card'
import { productSymbols } from '@/components/products/product-symbols'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import type { Product } from '@/lib/products/catalog'
import type { ProductPoint, ProductQuestion } from '@/lib/products/zenbu-japanese-for-iphone'
import { linkTo } from '@/lib/site'

export const sectionTitleClassName =
  'text-2xl font-semibold tracking-tight text-balance md:text-3xl'

export function SectionTitle({ title, aside }: { title: string; aside?: string }) {
  return (
    <h2 className={sectionTitleClassName}>
      {aside ? `${title} ` : title}
      {aside ? <span className="text-muted-foreground">{aside}</span> : null}
    </h2>
  )
}

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

export function ProductQuestions({ questions }: { questions: readonly ProductQuestion[] }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className={sectionTitleClassName}>Questions</h2>
      <Accordion
        defaultValue={[questions[0]?.question]}
        className="w-full max-w-2xl border-y text-left"
      >
        {questions.map(item => (
          <AccordionItem key={item.question} value={item.question}>
            <AccordionTrigger className="py-3.5 text-base hover:no-underline">
              {item.question}
            </AccordionTrigger>
            <AccordionContent keepMounted className="pb-4 text-[15px] text-muted-foreground">
              <p>{item.answer}</p>
              {item.link ? (
                <p>
                  <Link href={item.link.href}>{item.link.title}</Link>
                </p>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

export function MoreProducts({ products }: { products: readonly Product[] }) {
  const allProducts = linkTo('products')
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">More from Zenbu</h2>
        <Link
          href={allProducts.href}
          data-link-target={allProducts.target}
          className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          All products
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
