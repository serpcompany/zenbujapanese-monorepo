'use client'

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@zenbu/ui/components/carousel'
import { AppScreenshot } from '@/components/app-screenshot'
import { sectionTitleClassName } from '@/components/products/section-title'
import type { AppScreenshot as Screenshot } from '@/lib/app-screenshots'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'

const controlClassName = 'static translate-none rounded-lg'

export function ScreenshotCarousel({
  text,
  carousel,
  screenshots
}: {
  text: Dictionary['productPage']['screenshots']
  carousel: Dictionary['productPage']['carousel']
  screenshots: readonly { screenshot: Screenshot; caption: string }[]
}) {
  return (
    <Carousel
      opts={{ align: 'start' }}
      aria-roledescription={carousel.region}
      aria-labelledby="screenshots-heading"
      className="flex flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="screenshots-heading" className={sectionTitleClassName}>
          {text.heading}
        </h2>
        <div className="flex gap-2">
          <CarouselPrevious
            size="icon-lg"
            className={controlClassName}
            aria-label={text.previous}
          />
          <CarouselNext size="icon-lg" className={controlClassName} aria-label={text.next} />
        </div>
      </div>
      <div className="mask-r-from-[calc(100%-3rem)]">
        <CarouselContent className="-ml-6 py-2">
          {screenshots.map(({ screenshot, caption }, index) => (
            <CarouselItem
              key={screenshot.src}
              aria-roledescription={carousel.slide}
              aria-label={fill(carousel.position, { index: index + 1, count: screenshots.length })}
              className="basis-auto pl-6"
            >
              <figure className="flex w-44 flex-col items-center gap-3.5 md:w-50">
                <AppScreenshot screenshot={screenshot} className="block w-full" />
                <figcaption className="text-center text-sm font-medium text-balance">
                  {caption}
                </figcaption>
              </figure>
            </CarouselItem>
          ))}
        </CarouselContent>
      </div>
    </Carousel>
  )
}
