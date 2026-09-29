import Link from 'next/link'
import { Fragment } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { absoluteUrl } from '@/lib/site'

export interface Crumb {
  label: string
  path: string
  lang?: 'ja'
}

const home: Crumb = { label: 'Home', path: '/' }
const dictionary: Crumb = { label: 'Dictionary', path: '/dictionary/' }

/**
 * The trail from Home through Dictionary, and the page's `parent` when it has one, to the current
 * page, plus its BreadcrumbList structured data. `page` is omitted on the dictionary page itself.
 */
export function DictionaryBreadcrumbs({ page, parent }: { page?: Crumb; parent?: Crumb }) {
  const trail = [home, dictionary, ...(parent ? [parent] : []), ...(page ? [page] : [])]
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: absoluteUrl(crumb.path)
    }))
  }
  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap">
        {trail.map((crumb, index) => (
          <Fragment key={crumb.path}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem className="min-w-0">
              {index === trail.length - 1 ? (
                <BreadcrumbPage lang={crumb.lang} className="truncate">
                  {crumb.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link href={crumb.path} />}>{crumb.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
      <script
        type="application/ld+json"
        // JSON can't close the script tag once `<` is escaped.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: structured data from our own values
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c')
        }}
      />
    </Breadcrumb>
  )
}
