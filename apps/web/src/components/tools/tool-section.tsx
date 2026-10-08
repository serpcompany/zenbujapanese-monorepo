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
    <section className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          {line ? <p className="text-pretty text-muted-foreground">{line}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}
