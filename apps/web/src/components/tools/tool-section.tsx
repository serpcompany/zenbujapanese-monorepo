import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function ToolSection({
  title,
  line,
  aside,
  children,
  className
}: {
  title: string
  line?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-5', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {line ? <p className="text-[15px] text-pretty text-muted-foreground">{line}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

export const toolsPageClassName =
  'mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 pt-6 pb-16 md:px-5 md:pt-10'

export function ToolsHeading({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title}</h1>
      <p className="text-lg text-pretty text-muted-foreground">{lead}</p>
    </div>
  )
}
