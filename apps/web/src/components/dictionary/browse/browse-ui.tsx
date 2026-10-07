import { cn } from 'cn'
import Link from 'next/link'
import type { ReactNode } from 'react'

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
  aside
}: {
  title: string
  href?: string
  aside?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-xl font-semibold">
        {href ? (
          <Link href={href} className="hover:underline">
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

export function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
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
  count
}: {
  href: string
  title: string
  preview: string
  count: string
}) {
  return (
    <Link
      href={href}
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

export function Chip({ href, children, lang }: { href: string; children: ReactNode; lang?: 'ja' }) {
  return (
    <li>
      <Link
        href={href}
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
  trailing
}: {
  label: string
  tabs: readonly Tab[]
  trailing?: ReactNode
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
          <Link key={tab.href} href={tab.href} className={tabClass}>
            {tab.label}
          </Link>
        )
      )}
      {trailing ? <span className="ml-auto inline-flex items-center">{trailing}</span> : null}
    </nav>
  )
}

const pageWindow = 2

export function Pagination({
  page,
  pages,
  pathFor,
  label = 'Pages'
}: {
  page: number
  pages: number
  pathFor: (page: number) => string
  label?: string
}) {
  if (pages <= 1) return null
  const shown = [...new Set([1, ...windowAround(page, pages), pages])]
  const box =
    'inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm tabular-nums'
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      {page > 1 ? (
        <Link href={pathFor(page - 1)} className={cn(box, 'hover:bg-muted')} rel="prev">
          ← Previous
        </Link>
      ) : null}
      {shown.map((number, index) => (
        <span key={number} className="contents">
          {index > 0 && number - shown[index - 1] > 1 ? (
            <span className="text-muted-foreground">…</span>
          ) : null}
          {number === page ? (
            <span
              aria-current="page"
              className={cn(box, 'border-primary bg-primary text-primary-foreground')}
            >
              {number}
            </span>
          ) : (
            <Link href={pathFor(number)} className={cn(box, 'hover:bg-muted')}>
              {number}
            </Link>
          )}
        </span>
      ))}
      {page < pages ? (
        <Link href={pathFor(page + 1)} className={cn(box, 'hover:bg-muted')} rel="next">
          Next →
        </Link>
      ) : null}
    </nav>
  )
}

function windowAround(page: number, pages: number): number[] {
  const first = Math.max(1, page - pageWindow)
  const last = Math.min(pages, page + pageWindow)
  return Array.from({ length: last - first + 1 }, (_, index) => first + index)
}
