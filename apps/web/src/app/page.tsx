import type { Metadata } from 'next'
import { HomeAppExtras } from '@/components/home/home-app-extras'
import { HomeClosing } from '@/components/home/home-closing'
import { HomeFeatures } from '@/components/home/home-features'
import { HomeHero, TryDictionary } from '@/components/home/home-hero'
import { HomeWebTools } from '@/components/home/home-web-tools'
import { homeTitle } from '@/lib/home'
import { pageFor } from '@/lib/pages'

const { description } = pageFor('/')

export const metadata: Metadata = {
  title: { absolute: homeTitle },
  description,
  alternates: { canonical: '/' },
  openGraph: { title: homeTitle, description, url: '/' }
}

export default function HomePage() {
  return (
    <main className="flex flex-col">
      <HomeHero />
      <TryDictionary />
      <HomeFeatures />
      <HomeAppExtras />
      <HomeWebTools />
      <HomeClosing />
    </main>
  )
}
