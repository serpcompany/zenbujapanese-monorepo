import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const cellPadding = 'px-2.5 sm:px-4'

export function ToolTable({
  headings,
  children,
  className
}: {
  headings: readonly string[]
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('overflow-x-auto rounded-xl ring-1 ring-foreground/10', className)}>
      <table className="w-full border-collapse text-left text-[15px]">
        <thead className="muted-surface bg-muted/50 text-xs text-muted-foreground sm:tracking-wide sm:uppercase">
          <tr>
            {headings.map(heading => (
              <th key={heading} scope="col" className={cn(cellPadding, 'py-2.5 font-semibold')}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        {children}
      </table>
    </div>
  )
}
