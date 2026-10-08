import Image from 'next/image'
import { appScreenshotSize, type AppScreenshot as Screenshot } from '@/lib/app-screenshots'
import { cn } from '@/lib/utils'

export function AppScreenshot({
  screenshot,
  decorative = false,
  eager = false,
  className
}: {
  screenshot: Screenshot
  decorative?: boolean
  eager?: boolean
  className?: string
}) {
  return (
    <Image
      src={screenshot.src}
      alt={decorative ? '' : screenshot.alt}
      width={appScreenshotSize.width}
      height={appScreenshotSize.height}
      unoptimized
      loading={eager ? 'eager' : 'lazy'}
      draggable={false}
      className={cn(
        'block h-auto w-full shrink-0 rounded-[13.7%/6.3%] bg-background shadow-[0_2px_4px_oklch(0_0_0/0.06),0_24px_48px_-18px_oklch(0_0_0/0.3)] ring-1 ring-foreground/10',
        className
      )}
    />
  )
}
