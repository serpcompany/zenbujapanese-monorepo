import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@zenbu/ui/components/breadcrumb'
import Link from 'next/link'
import { Fragment } from 'react'
import { JsonLd } from '@/components/json-ld'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { absoluteUrl } from '@/lib/site'

export interface Crumb {
  label: string
  path: string
  href?: string
  lang?: 'ja'
}

const shortTrail = 3

export function DictionaryBreadcrumbs({
  locale,
  page,
  parent,
  pages
}: {
  locale: Locale
  page?: Crumb
  parent?: Crumb
  pages?: Crumb[]
}) {
  const t = getDictionary(locale).breadcrumbs
  const trail: Crumb[] = [
    { label: t.home, path: '/' },
    { label: t.dictionary, path: '/dictionary/' },
    ...(pages ?? [...(parent ? [parent] : []), ...(page ? [page] : [])])
  ]
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: absoluteUrl(localizedPath(crumb.path, locale))
    }))
  }
  return (
    <Breadcrumb aria-label={t.label}>
      <BreadcrumbList className={trail.length > shortTrail ? undefined : 'flex-nowrap'}>
        {trail.map((crumb, index) => (
          <Fragment key={crumb.path}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem className={index === trail.length - 1 ? 'min-w-0' : 'shrink-0'}>
              {index === trail.length - 1 ? (
                <BreadcrumbPage lang={crumb.lang} className="truncate">
                  {crumb.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  render={<Link href={localizedPath(crumb.href ?? crumb.path, locale)} />}
                  lang={crumb.lang}
                >
                  {crumb.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
      <JsonLd data={structuredData} />
    </Breadcrumb>
  )
}
