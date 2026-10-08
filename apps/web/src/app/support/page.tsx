import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export const metadata = pageMetadata('/support/')

export default function SupportPage() {
  return (
    <PageShell title="Support">
      <p>
        For help with {site.name}, email{' '}
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>. Include your iPhone model,
        iOS version, and what you were doing when the problem happened.
      </p>
      <p>
        For help with Tomodachi, email the same address. Read{' '}
        <Link href="/legal/privacy/#tomodachi">how Tomodachi handles your information</Link>.
      </p>
      <p>
        Read how we handle information in the <Link href="/legal/privacy/">Privacy Policy</Link>.
      </p>
    </PageShell>
  )
}
