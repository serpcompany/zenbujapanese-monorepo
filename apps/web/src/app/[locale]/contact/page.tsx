import { PageShell } from '@/components/page-shell'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export const metadata = pageMetadata('/contact/')

export default function ContactPage() {
  return (
    <PageShell title="Contact">
      <p>
        Email <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>. We read every
        message.
      </p>
    </PageShell>
  )
}
