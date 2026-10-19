import type { Metadata } from 'next'
import { HomeAreas } from '@/components/home/home-areas'
import { HomeClosing } from '@/components/home/home-closing'
import { HomeHero } from '@/components/home/home-hero'
import { HomeWebTools } from '@/components/home/home-web-tools'
import { TryDictionary } from '@/components/home/try-dictionary'
import { OriginCanonical } from '@/components/origin-canonical'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'
import { pageFor } from '@/lib/pages'
import { siteOpenGraph } from '@/lib/seo'

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const locale = await localeOf(params)
  const title = getDictionary(locale).home.title
  const { description } = pageFor('/', locale)
  return {
    title: { absolute: title },
    description,
    openGraph: { ...siteOpenGraph(locale), title, description }
  }
}

export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const locale = await localeOf(params)
  return (
    <main className="flex flex-col">
      <OriginCanonical locale={locale} />
      <HomeHero locale={locale} />
      <TryDictionary locale={locale} />
      <HomeAreas locale={locale} />
      <HomeWebTools locale={locale} />
      <HomeClosing locale={locale} />
    </main>
  )
}
