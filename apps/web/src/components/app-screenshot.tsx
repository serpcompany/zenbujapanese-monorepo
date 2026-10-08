import Image from 'next/image'
import type { AppScreenshot as Screenshot } from '@/lib/app-screenshots'
import { cn } from '@/lib/utils'

export function AppScreenshot({
  screenshot,
  className,
  eager = false
}: {
  screenshot: Screenshot
  className?: string
  eager?: boolean
}) {
  return (
    <Image
      src={screenshot.src}
      alt={screenshot.alt}
      width={screenshot.width}
      height={screenshot.height}
      unoptimized
      loading={eager ? 'eager' : 'lazy'}
      className={cn(
        'h-auto rounded-[13.7%/6.3%] bg-background shadow-[0_2px_4px_rgb(0_0_0/0.06),0_24px_48px_-18px_rgb(0_0_0/0.3)] ring-1 ring-foreground/10',
        className
      )}
    />
  )
}
