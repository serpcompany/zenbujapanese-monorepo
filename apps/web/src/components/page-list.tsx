import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import type { SitePage } from '@/lib/pages'

export function PageList({ title, pages }: { title: string; pages: readonly SitePage[] }) {
  return (
    <PageShell title={title}>
      <ul>
        {pages.map(page => (
          <li key={page.path}>
            <Link href={page.path}>{page.title}</Link>
          </li>
        ))}
      </ul>
    </PageShell>
  )
}
