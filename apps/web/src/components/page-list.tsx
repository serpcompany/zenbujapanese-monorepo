import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'
import type { SitePage, SitePath } from '@/lib/pages'

export function PageList({
  path,
  pages,
  locale
}: {
  path: SitePath
  pages: readonly SitePage[]
  locale: Locale
}) {
  return (
    <PageShell path={path} locale={locale}>
      <ul>
        {pages.map(page => (
          <li key={page.path}>
            <Link href={localizedPath(page.path, locale)}>{page.title}</Link>
          </li>
        ))}
      </ul>
    </PageShell>
  )
}
