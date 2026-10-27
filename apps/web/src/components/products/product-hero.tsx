import { buttonVariants } from '@zenbu/ui/components/button'
import { PlayIcon } from 'lucide-react'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { FeatureDemo } from '@/components/products/feature-demo'
import { SectionBreadcrumbs } from '@/components/section-breadcrumbs'
import { AppStoreButton } from '@/components/site-actions'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { pageFor } from '@/lib/pages'
import { productsPath } from '@/lib/products/catalog'
import type { ProductDemo } from '@/lib/products/product-page'
import { linkTo } from '@/lib/site'
import { cn } from '@/lib/utils'
import { videosSectionId } from '@/lib/videos'

export interface ProductHeroContent {
  title: string
  name: string
  subtitle: string
  lead: string
  icon: string
  demos: readonly ProductDemo[]
}

const heroButtonClassName = 'h-11 px-4.5 text-[15px]'

export function ProductHero({
  product,
  facts,
  hasVideos,
  locale
}: {
  product: ProductHeroContent
  facts: ReactNode
  hasVideos: boolean
  locale: Locale
}) {
  const t = getDictionary(locale)
  const text = t.productPage
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4.5 px-4 pt-8 pb-12 text-center md:px-5 md:pt-10 md:pb-16">
      <SectionBreadcrumbs
        section={{
          title: pageFor(productsPath, locale).title,
          ...linkTo('products'),
          href: localizedPath(linkTo('products').href, locale)
        }}
        page={product.title}
        label={text.breadcrumb}
        className="justify-center"
      />
      <Image
        src={product.icon}
        alt=""
        width={72}
        height={72}
        unoptimized
        loading="eager"
        className="mt-2 size-18 rounded-[22.5%] shadow-[0_12px_28px_-12px_oklch(0_0_0/0.35)] ring-1 ring-foreground/10"
      />
      <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl lg:text-[3.25rem]">
        {product.name}
      </h1>
      <p className="-mt-2 text-[15px] text-muted-foreground">{product.subtitle}</p>
      <p className="max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
        {product.lead}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <AppStoreButton
          locale={locale}
          label={t.chrome.getTheApp}
          size="lg"
          className={heroButtonClassName}
        />
        {hasVideos ? (
          <a
            href={`#${videosSectionId}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), heroButtonClassName)}
          >
            <PlayIcon data-icon="inline-start" aria-hidden="true" />
            {text.watchDemo}
          </a>
        ) : null}
      </div>
      <div className="mt-6 w-full max-w-3xl">
        <FeatureDemo demos={product.demos} text={text.demo} carousel={text.carousel} />
      </div>
      {facts}
    </section>
  )
}
