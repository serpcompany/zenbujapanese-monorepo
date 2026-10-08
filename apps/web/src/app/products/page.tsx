import { CatalogCluster } from '@/components/products/catalog-cluster'
import { ProductCatalog } from '@/components/products/product-catalog'
import { pageMetadata } from '@/lib/metadata'
import { pageFor } from '@/lib/pages'
import { productsPath } from '@/lib/products/catalog'

export const metadata = pageMetadata(productsPath)

export default function ProductsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-4 pt-12 pb-16 text-center md:px-5 md:pt-16">
      <ProductCatalog>
        <CatalogCluster />
        <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          {pageFor(productsPath).title}
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          Apps and free tools for reading, writing, and speaking Japanese, all built on one
          dictionary.
        </p>
      </ProductCatalog>
    </main>
  )
}
