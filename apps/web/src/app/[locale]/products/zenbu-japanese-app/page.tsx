import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ProductFacts } from '@/components/products/product-facts'
import { ProductHero } from '@/components/products/product-hero'
import {
  MoreProducts,
  ProductBand,
  ProductPoints,
  ProductQuestions
} from '@/components/products/product-sections'
import { ProductVideos } from '@/components/products/product-videos'
import { ScreenshotCarousel } from '@/components/products/screenshot-carousel'
import { SectionTitle } from '@/components/products/section-title'
import { appStoreRelease } from '@/lib/app-store'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { pageMetadata } from '@/lib/metadata'
import { iphoneAppPageIn, iphoneAppPath } from '@/lib/products/zenbu-japanese-for-iphone'
import { appVideos } from '@/lib/videos'

export const dynamic = 'force-dynamic'

type Props = PageProps<'/[locale]/products/zenbu-japanese-app'>

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await localeOf(params)
  const t = getDictionary(locale)
  const title = fill(t.productPage.title, { name: t.products.featuredApp.title })
  const page = pageMetadata(iphoneAppPath, locale)
  return {
    ...page,
    title: { absolute: title },
    openGraph: { ...page.openGraph, title }
  }
}

const block = 'mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 md:px-5'

async function FactsFromAppStore({ platform, locale }: { platform: string; locale: Locale }) {
  return <ProductFacts platform={platform} locale={locale} release={await appStoreRelease()} />
}

export default async function ZenbuJapaneseForIphonePage({ params }: Props) {
  const locale = await localeOf(params)
  const t = getDictionary(locale).productPage
  const product = iphoneAppPageIn(locale)
  return (
    <main className="flex w-full flex-col pb-16">
      <ProductHero
        product={product}
        locale={locale}
        hasVideos={appVideos.length > 0}
        facts={
          <Suspense fallback={<ProductFacts {...product.facts} locale={locale} release={null} />}>
            <FactsFromAppStore {...product.facts} locale={locale} />
          </Suspense>
        }
      />
      <ProductBand>
        <div className={block}>
          <ScreenshotCarousel
            text={t.screenshots}
            carousel={t.carousel}
            screenshots={product.screenshots}
          />
        </div>
      </ProductBand>
      <section className={`${block} py-12 md:py-16`}>
        <SectionTitle title={t.inside.heading} aside={t.inside.aside} />
        <ProductPoints points={product.features} />
      </section>
      <ProductVideos videos={appVideos} locale={locale} text={t.videos} carousel={t.carousel} />
      <section className={`${block} py-12 md:py-16`}>
        <ProductQuestions questions={product.questions} locale={locale} />
      </section>
      <section className={block}>
        <MoreProducts products={product.related} locale={locale} />
      </section>
    </main>
  )
}
