import type { Metadata } from 'next'
import { CatalogCluster } from '@/components/products/catalog-cluster'
import { ProductCatalog } from '@/components/products/product-catalog'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'
import { pageMetadata } from '@/lib/metadata'
import { pageFor } from '@/lib/pages'
import { productsPath } from '@/lib/products/catalog'
import { catalogIn } from '@/lib/products/localized-catalog'

export async function generateMetadata({
  params
}: PageProps<'/[locale]/products'>): Promise<Metadata> {
  return pageMetadata(productsPath, await localeOf(params))
}

export default async function ProductsPage({ params }: PageProps<'/[locale]/products'>) {
  const locale = await localeOf(params)
  const t = getDictionary(locale)
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-4 pt-12 pb-16 text-center md:px-5 md:pt-16">
      <ProductCatalog
        catalog={catalogIn(locale)}
        locale={locale}
        text={{ ...t.products.catalog, getTheApp: t.chrome.getTheApp }}
      >
        <CatalogCluster />
        <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          {pageFor(productsPath, locale).title}
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">{t.products.lead}</p>
      </ProductCatalog>
    </main>
  )
}
