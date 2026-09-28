import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { site } from '@/lib/site'

export const metadata: Metadata = {
  title: { absolute: `${site.name}: Japanese Dictionary & Translator` },
  alternates: { canonical: '/' }
}

export default function HomePage() {
  return (
    <PageShell title={site.name}>
      <p>{site.description}</p>
      <p>
        <Link href="/support">Get support</Link>
      </p>
    </PageShell>
  )
}
