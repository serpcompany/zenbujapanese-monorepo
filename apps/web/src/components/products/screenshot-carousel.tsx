'use client'

import { AppScreenshot } from '@/components/app-screenshot'
import { sectionTitleClassName } from '@/components/products/product-sections'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@/components/ui/carousel'
import type { AppScreenshot as Screenshot } from '@/lib/app-screenshots'

const controlClassName = 'static translate-none rounded-lg'

export function ScreenshotCarousel({
  title,
  screenshots
}: {
  title: string
  screenshots: readonly { screenshot: Screenshot; caption: string }[]
}) {
  return (
    <Carousel
      opts={{ align: 'start' }}
      aria-labelledby="screenshots-heading"
      className="flex flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="screenshots-heading" className={sectionTitleClassName}>
          {title}
        </h2>
        <div className="flex gap-2">
          <CarouselPrevious
            size="icon-lg"
            className={controlClassName}
            aria-label="Previous screenshots"
          />
          <CarouselNext size="icon-lg" className={controlClassName} aria-label="Next screenshots" />
        </div>
      </div>
      <div className="mask-r-from-[calc(100%-3rem)]">
        <CarouselContent className="-ml-6 py-2">
          {screenshots.map(({ screenshot, caption }, index) => (
            <CarouselItem
              key={screenshot.src}
              aria-label={`${index + 1} of ${screenshots.length}`}
              className="basis-auto pl-6"
            >
              <figure className="flex w-44 flex-col items-center gap-3.5 md:w-50">
                <AppScreenshot screenshot={screenshot} />
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
