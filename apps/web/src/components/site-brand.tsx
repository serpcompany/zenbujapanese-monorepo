import Link from 'next/link'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'

export function SiteBrand({
  className,
  nameClassName
}: {
  className?: string
  nameClassName?: string
}) {
  return (
    <Link href="/" className={cn('flex shrink-0 items-center gap-2 font-medium', className)}>
      <span
        lang="ja"
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-md bg-primary text-[15px] text-primary-foreground"
      >
        {site.mark}
      </span>
      <span className={nameClassName}>{site.name}</span>
    </Link>
  )
}
