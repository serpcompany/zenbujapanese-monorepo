import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

export function ArrowLink({
  href,
  target,
  children
}: {
  href: string
  target?: string
  children: string
}) {
  return (
    <Link
      href={href}
      data-link-target={target}
      className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
    >
      {children}
      <ArrowRightIcon aria-hidden="true" className="size-4" />
    </Link>
  )
}

export function ToolSection({
  title,
  line,
  aside,
  children
}: {
  title: string
  line?: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          {line ? <p className="max-w-3xl text-pretty text-muted-foreground">{line}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}
