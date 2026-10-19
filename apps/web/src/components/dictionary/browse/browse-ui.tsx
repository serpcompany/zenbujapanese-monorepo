import { cn } from 'cn'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Fill } from '@/components/fill'
import { browseText } from '@/lib/dictionary/browse/copy'
import { type PageNumber, pageNumbers } from '@/lib/dictionary/browse/pagination'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { formatNumber } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'

export function BrowsePage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 pt-4 pb-16 md:px-5">
      {children}
    </main>
  )
}

export function BrowseHeading({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
      {children ? <p className="max-w-3xl text-muted-foreground">{children}</p> : null}
    </div>
  )
}

export function Sentences({
  locale,
  sentences
}: {
  locale: Locale
  sentences: readonly ReactNode[]
}) {
  const [first, ...rest] = sentences.filter(
    sentence => sentence !== null && sentence !== undefined && sentence !== false
  )
  if (rest.length === 0) return first
  return (
    <Fill
      template={getDictionary(locale).site.sentences}
      values={{ first, second: <Sentences locale={locale} sentences={rest} /> }}
    />
  )
}

export function Panel({
  children,
  className,
  label
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  return (
    <section
      aria-label={label}
      className={cn('flex flex-col gap-3 rounded-xl border p-5 sm:p-6', className)}
    >
      {children}
    </section>
  )
}

export function PanelHeading({
  title,
  href,
  aside,
  locale
}: {
  title: string
  href?: string
  aside?: ReactNode
  locale: Locale
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-xl font-semibold">
        {href ? (
          <Link href={localizedPath(href, locale)} className="hover:underline">
            {title}
          </Link>
        ) : (
          title
        )}
      </h2>
      {aside ? <div className="text-sm text-muted-foreground">{aside}</div> : null}
    </div>
  )
}

export function MoreLink({
  href,
  locale,
  children
}: {
  href: string
  locale: Locale
  children: ReactNode
}) {
  return (
    <Link
      href={localizedPath(href, locale)}
      className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
    >
      {children}
    </Link>
  )
}

export function LevelCard({
  href,
  title,
  preview,
  count,
  locale
}: {
  href: string
  title: string
  preview: string
  count: string
  locale: Locale
}) {
  return (
    <Link
      href={localizedPath(href, locale)}
      className="flex flex-col gap-1.5 rounded-lg border px-4 py-3.5 hover:bg-muted"
    >
      <span className="font-semibold">{title}</span>
      <span lang="ja" className="text-[15px] text-muted-foreground">
        {preview}
      </span>
      <span className="text-sm text-muted-foreground">{count}</span>
    </Link>
  )
}

export function Chips({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {children}
    </ul>
  )
}

export function Chip({
  href,
  children,
  lang,
  locale
}: {
  href: string
  children: ReactNode
  lang?: 'ja'
  locale: Locale
}) {
  return (
    <li>
      <Link
        href={localizedPath(href, locale)}
        lang={lang}
        className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[15px] hover:bg-muted"
      >
        {children}
      </Link>
    </li>
  )
}

export interface Tab {
  label: string
  href: string
  current: boolean
}

export function LinkTabs({
  label,
  tabs,
  trailing,
  locale
}: {
  label: string
  tabs: readonly Tab[]
  trailing?: ReactNode
  locale: Locale
}) {
  const tabClass =
    '-mb-px inline-flex min-h-11 items-center border-b-2 border-transparent text-sm text-muted-foreground hover:text-foreground'
  return (
    <nav aria-label={label} className="flex flex-wrap gap-x-6 border-b">
      {tabs.map(tab =>
        tab.current ? (
          <span
            key={tab.href}
            aria-current="page"
            className={cn(tabClass, 'border-foreground font-semibold text-foreground')}
          >
            {tab.label}
          </span>
        ) : (
          <Link key={tab.href} href={localizedPath(tab.href, locale)} className={tabClass}>
            {tab.label}
          </Link>
        )
      )}
      {trailing ? <span className="ml-auto inline-flex items-center">{trailing}</span> : null}
    </nav>
  )
}

const gapClass = ({ wide, phone }: PageNumber['gapBefore']) =>
  wide && phone ? '' : wide ? 'max-sm:hidden' : 'sm:hidden'

export function Pagination({
  page,
  pages,
  pathFor,
  locale
}: {
  page: number
  pages: number
  pathFor: (page: number) => string
  locale: Locale
}) {
  if (pages <= 1) return null
  const t = browseText(locale).pagination
  const href = (number: number) => localizedPath(pathFor(number), locale)
  const box =
    'inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm tabular-nums'
  return (
    <nav aria-label={t.label} className="flex flex-wrap items-center gap-2">
      {page > 1 ? (
        <Link href={href(page - 1)} className={cn(box, 'hover:bg-muted')} rel="prev">
          ← <span className="max-sm:sr-only">{t.previous}</span>
        </Link>
      ) : null}
      {pageNumbers(page, pages).map(({ number, onPhone, gapBefore }) => (
        <span key={number} className="contents">
          {gapBefore.wide || gapBefore.phone ? (
            <span className={cn('text-muted-foreground', gapClass(gapBefore))}>…</span>
          ) : null}
          {number === page ? (
            <span
              aria-current="page"
              className={cn(box, 'border-primary bg-primary text-primary-foreground')}
            >
              {formatNumber(number, locale)}
            </span>
          ) : (
            <Link
              href={href(number)}
              className={cn(box, 'hover:bg-muted', !onPhone && 'max-sm:hidden')}
            >
              {formatNumber(number, locale)}
            </Link>
          )}
        </span>
      ))}
      {page < pages ? (
        <Link href={href(page + 1)} className={cn(box, 'hover:bg-muted')} rel="next">
          <span className="max-sm:sr-only">{t.next}</span> →
        </Link>
      ) : null}
    </nav>
  )
}
