'use client'

import { useEffect, useState } from 'react'
import { AppScreenshot } from '@/components/app-screenshot'
import { productSymbols } from '@/components/products/product-symbols'
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@/components/ui/carousel'
import type { ProductDemo } from '@/lib/products/zenbu-japanese-for-iphone'
import { cn } from '@/lib/utils'

function useSelectedSlide(api: CarouselApi) {
  const [selected, setSelected] = useState(0)
  useEffect(() => {
    if (!api) return
    const select = () => setSelected(api.selectedScrollSnap())
    select()
    api.on('select', select)
    return () => {
      api.off('select', select)
    }
  }, [api])
  return selected
}

function DemoSlide({ demo, first }: { demo: ProductDemo; first: boolean }) {
  const Icon = productSymbols[demo.symbol]
  return (
    <div className="grid h-full items-center gap-6 overflow-hidden rounded-2xl bg-muted px-6 pt-8 text-left md:grid-cols-2 md:gap-8 md:px-10 md:pt-10">
      <div className="flex flex-col gap-2.5 md:pb-10">
        <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
          {demo.label}
        </p>
        <h3 className="text-xl font-semibold tracking-tight text-balance">{demo.title}</h3>
        <p className="leading-relaxed text-muted-foreground">{demo.description}</p>
      </div>
      <div className="flex h-80 justify-center overflow-hidden md:h-96">
        <AppScreenshot
          screenshot={demo.screenshot}
          eager={first}
          className="w-56 self-start md:w-64"
        />
      </div>
    </div>
  )
}

export function FeatureDemo({ demos }: { demos: readonly ProductDemo[] }) {
  const [api, setApi] = useState<CarouselApi>()
  const selected = useSelectedSlide(api)
  return (
    <Carousel
      setApi={setApi}
      opts={{ loop: true }}
      aria-label="Features"
      className="flex w-full min-w-0 flex-col gap-4"
    >
      <CarouselContent>
        {demos.map((demo, index) => (
          <CarouselItem
            key={demo.label}
            aria-label={`${index + 1} of ${demos.length}`}
            inert={index !== selected}
            aria-hidden={index !== selected}
          >
            <DemoSlide demo={demo} first={index === 0} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <div className="flex items-center gap-3 self-center">
        <CarouselPrevious
          size="icon-lg"
          className="static translate-none rounded-lg"
          aria-label="Previous feature"
        />
        <div className="flex items-center gap-1.5">
          {demos.map((demo, index) => (
            <button
              key={demo.label}
              type="button"
              aria-label={demo.label}
              aria-current={index === selected}
              onClick={() => api?.scrollTo(index)}
              className={cn(
                'h-2 w-2 rounded-full bg-foreground/20 transition-[width,background-color] outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                index === selected && 'w-6 bg-foreground'
              )}
            />
          ))}
        </div>
        <span className="min-w-10 text-center text-[13px] text-muted-foreground tabular-nums">
          {selected + 1} / {demos.length}
        </span>
        <CarouselNext
          size="icon-lg"
          className="static translate-none rounded-lg"
          aria-label="Next feature"
        />
      </div>
    </Carousel>
  )
}
