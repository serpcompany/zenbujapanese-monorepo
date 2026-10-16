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
import { pageMetadata } from '@/lib/metadata'
import { iphoneAppPage } from '@/lib/products/zenbu-japanese-for-iphone'
import { appVideos } from '@/lib/videos'

export const dynamic = 'force-dynamic'

const title = `${iphoneAppPage.title}: Japanese Dictionary & Translator`
const page = pageMetadata(iphoneAppPage.path)

export const metadata: Metadata = {
  ...page,
  title: { absolute: title },
  openGraph: { ...page.openGraph, title }
}

const block = 'mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 md:px-5'

async function FactsFromAppStore() {
  return <ProductFacts {...iphoneAppPage.facts} release={await appStoreRelease()} />
}

export default function ZenbuJapaneseForIphonePage() {
  return (
    <main className="flex w-full flex-col pb-16">
      <ProductHero
        product={iphoneAppPage}
        hasVideos={appVideos.length > 0}
        facts={
          <Suspense fallback={<ProductFacts {...iphoneAppPage.facts} release={null} />}>
            <FactsFromAppStore />
          </Suspense>
        }
      />
      <ProductBand>
        <div className={block}>
          <ScreenshotCarousel title="See it in action." screenshots={iphoneAppPage.screenshots} />
        </div>
      </ProductBand>
      <section className={`${block} py-12 md:py-16`}>
        <SectionTitle title="What’s inside." aside="Four tabs, one dictionary." />
        <ProductPoints points={iphoneAppPage.features} />
      </section>
      <ProductVideos videos={appVideos} />
      <section className={`${block} py-12 md:py-16`}>
        <ProductQuestions questions={iphoneAppPage.questions} />
      </section>
      <section className={block}>
        <MoreProducts products={iphoneAppPage.related} />
      </section>
    </main>
  )
}
