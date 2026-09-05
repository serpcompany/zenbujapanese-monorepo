import { Suspense } from "react"

import { PrototypeSwitcher } from "@/components/prototype/prototype-switcher"
import { DictionarySearchIntro, ResultsHeading, SiteFooter, SiteHeader } from "@/components/prototype/dictionary-sections"
import { VariantA, VariantB, VariantC } from "@/components/prototype/dictionary-variants"
import { allResults } from "@/lib/prototype-data"

type PageProps = {
  searchParams: Promise<{ variant?: string | string[]; search?: string | string[] }>
}

export default async function DictionaryPrototypePage({ searchParams }: PageProps) {
  const params = await searchParams
  const rawVariant = Array.isArray(params.variant) ? params.variant[0] : params.variant
  const variant = rawVariant === "B" || rawVariant === "C" ? rawVariant : "A"
  const rawSearch = Array.isArray(params.search) ? params.search[0] : params.search
  const query = rawSearch?.trim() || "hello"

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <DictionarySearchIntro query={query} variant={variant} />
        <section className="mt-8 space-y-6" id="results">
          <ResultsHeading count={allResults.length} query={query} />
          {variant === "A" ? <VariantA /> : null}
          {variant === "B" ? <VariantB /> : null}
          {variant === "C" ? <VariantC /> : null}
        </section>
      </main>
      <SiteFooter />
      <Suspense><PrototypeSwitcher current={variant} /></Suspense>
    </>
  )
}
