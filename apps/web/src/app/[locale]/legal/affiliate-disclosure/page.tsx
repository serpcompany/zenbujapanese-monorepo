import { PageShell } from '@/components/page-shell'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export const metadata = pageMetadata('/legal/affiliate-disclosure/')

export default function AffiliateDisclosurePage() {
  return (
    <PageShell title="Affiliate Disclosure" updated="September 28, 2026">
      <p>
        Some links on zenbujapanese.com may be affiliate links. If you buy through one, {site.name}{' '}
        may earn a commission at no extra cost to you. We disclose this under the U.S. Federal Trade
        Commission's Guides Concerning the Use of Endorsements and Testimonials in Advertising (16
        CFR Part 255).
      </p>
      <p>
        Commissions never change how {site.name} ranks dictionary results. We recommend products and
        resources only when we think they help Japanese learners, and our opinions are our own.
      </p>
    </PageShell>
  )
}
