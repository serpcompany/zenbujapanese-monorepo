import Image from 'next/image'
import Link from 'next/link'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'
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
  locale,
  className,
  nameClassName
}: {
  locale: Locale
  className?: string
  nameClassName?: string
}) {
  return (
    <Link
      href={localizedPath('/', locale)}
      className={cn('flex shrink-0 items-center gap-2 font-medium', className)}
    >
      <SiteLogo />
      <span className={nameClassName}>{site.name}</span>
    </Link>
  )
}
