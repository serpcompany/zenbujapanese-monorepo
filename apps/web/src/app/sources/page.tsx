import { PageShell } from '@/components/page-shell'
import { type Source, sources } from '@/lib/dictionary/sources'
import { pageMetadata } from '@/lib/metadata'
import { site } from '@/lib/site'

export const metadata = pageMetadata('/sources/')

const allSources: Source[] = Object.values(sources)

export default function SourcesPage() {
  return (
    <PageShell title="Sources">
      <p>
        {site.name}'s dictionary is built from open data. Thank you to the people and projects
        behind it. Each source is listed with its credit and licence.
      </p>
      <ul className="flex flex-col gap-2">
        {allSources.map(source => (
          <li key={source.name}>
            <a href={source.url}>{source.name}</a>: {source.credit}{' '}
            {source.license.url ? (
              <a href={source.license.url}>{source.license.name}</a>
            ) : (
              source.license.name
            )}
            .
          </li>
        ))}
      </ul>
    </PageShell>
  )
}
