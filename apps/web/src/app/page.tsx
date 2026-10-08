import type { Metadata } from 'next'
import { HomeAreas } from '@/components/home/home-areas'
import { HomeClosing } from '@/components/home/home-closing'
import { HomeHero } from '@/components/home/home-hero'
import { HomeWebTools } from '@/components/home/home-web-tools'
import { TryDictionary } from '@/components/home/try-dictionary'
import { OriginCanonical } from '@/components/origin-canonical'
import { homeTitle } from '@/lib/home'
import { siteOpenGraph } from '@/lib/metadata'
import { pageFor } from '@/lib/pages'

const { description } = pageFor('/')

export const metadata: Metadata = {
  title: { absolute: homeTitle },
  description,
  openGraph: { ...siteOpenGraph, title: homeTitle, description }
}

export default function HomePage() {
  return (
    <main className="flex flex-col">
      <OriginCanonical />
      <HomeHero />
      <TryDictionary />
      <HomeAreas />
      <HomeWebTools />
      <HomeClosing />
    </main>
  )
}
