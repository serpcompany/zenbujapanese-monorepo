import { creditsShownBy } from '@zenbu/dictionary-core/sources/credits'
import { SourceCreditItem } from '@/components/dictionary/source-credits'
import { PageShell } from '@/components/page-shell'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export const metadata = pageMetadata('/sources/')

const { conversionNotice, credits } = creditsShownBy('website')

export default function SourcesPage() {
  return (
    <PageShell title="Sources">
      <p>
        {site.name}'s dictionary is built from open data. Thank you to the people and projects
        behind it. Each source is listed with its credit and licence.
      </p>
      <p>{conversionNotice}</p>
      <ul className="flex flex-col gap-2">
        {credits.map(source => (
          <SourceCreditItem key={source.id} source={source} />
        ))}
      </ul>
    </PageShell>
  )
}
