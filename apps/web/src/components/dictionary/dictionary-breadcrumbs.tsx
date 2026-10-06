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
  href?: string
  lang?: 'ja'
}

const home: Crumb = { label: 'Home', path: '/' }
const shortTrail = 3
const dictionary: Crumb = { label: 'Dictionary', path: '/dictionary/' }

function jsonThatCannotCloseItsScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

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
      <BreadcrumbList className={trail.length > shortTrail ? undefined : 'flex-nowrap'}>
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
        dangerouslySetInnerHTML={{ __html: jsonThatCannotCloseItsScript(structuredData) }}
      />
    </Breadcrumb>
  )
}
