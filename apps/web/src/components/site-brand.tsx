import Image from 'next/image'
import Link from 'next/link'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'

export function SiteLogo() {
  return (
    <Image
      src="/zenbu-icon-flat-vector.svg"
      alt=""
      width={30}
      height={30}
      unoptimized
      className="size-7.5 shrink-0"
    />
  )
}

export function SiteBrand({
  className,
  nameClassName
}: {
  className?: string
  nameClassName?: string
}) {
  return (
    <Link href="/" className={cn('flex shrink-0 items-center gap-2 font-medium', className)}>
      <SiteLogo />
      <span className={nameClassName}>{site.name}</span>
    </Link>
  )
}
