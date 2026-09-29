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
  /** Where the visible link goes, when not `path`, such as a table in the register just left. */
  href?: string
  lang?: 'ja'
}

const home: Crumb = { label: 'Home', path: '/' }
const dictionary: Crumb = { label: 'Dictionary', path: '/dictionary/' }

/**
 * The trail from Home through Dictionary to the current page, plus its BreadcrumbList
 * structured data. `page` is omitted on the dictionary page itself; `parent` comes between
 * Dictionary and the page, as a search does before its Example Sentences page. `pages` is the
 * whole trail below Dictionary for a deeper page, such as a word's conjugations, the current
 * page last.
 */
export function DictionaryBreadcrumbs({
  page,
  parent,
  pages
}: {
  page?: Crumb
  parent?: Crumb
  pages?: Crumb[]
}) {
  const trail = [
    home,
    dictionary,
    ...(pages ?? [...(parent ? [parent] : []), ...(page ? [page] : [])])
  ]
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
                <BreadcrumbLink render={<Link href={crumb.href ?? crumb.path} />} lang={crumb.lang}>
                  {crumb.label}
                </BreadcrumbLink>
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
