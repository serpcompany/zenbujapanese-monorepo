import { PageShell } from '@/components/page-shell'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export const metadata = pageMetadata('/about/')

export default function AboutPage() {
  return (
    <PageShell title="About">
      <p>
        {site.name} helps learners understand the Japanese they meet: typed, photographed,
        handwritten, or heard in a video. Its dictionary works offline.
      </p>
    </PageShell>
  )
}
