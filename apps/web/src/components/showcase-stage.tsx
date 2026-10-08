'use client'

import { type ComponentProps, type ReactNode, useEffect, useState } from 'react'
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@/components/ui/carousel'
import { cn } from '@/lib/utils'

export interface ShowcaseMedia {
  key: string
  label: string
  shape: 'phone' | 'card'
  content: ReactNode
}

interface StageView {
  canScrollPrev: boolean
  canScrollNext: boolean
  inView: number[]
}

const mostThatFit = 3

const stageOptions = {
  align: 'start',
  containScroll: 'trimSnaps',
  inViewThreshold: 0.75,
  watchDrag: api => api.canScrollPrev() || api.canScrollNext()
} satisfies ComponentProps<typeof Carousel>['opts']

function useStageView(api: CarouselApi) {
  const [view, setView] = useState<StageView>()
  useEffect(() => {
    if (!api) return
    const update = () =>
      setView({
        canScrollPrev: api.canScrollPrev(),
        canScrollNext: api.canScrollNext(),
        inView: api.slidesInView()
      })
    update()
    api.on('select', update).on('reInit', update).on('slidesInView', update)
    return () => {
      api.off('select', update).off('reInit', update).off('slidesInView', update)
    }
  }, [api])
  return view
}

function mediaFrame(item: ShowcaseMedia, index: number, count: number) {
  if (item.shape === 'card') return 'w-60 self-center md:w-48 lg:w-64'
  if (count === 1) return 'w-50 md:w-56 lg:w-64'
  return cn(
    'w-full group-data-[paged=false]/stage:w-[min(9.5rem,38vw)] md:group-data-[paged=false]/stage:w-48 lg:group-data-[paged=false]/stage:w-56',
    index === 1 && 'group-data-[paged=false]/stage:mt-10'
  )
}

function StageDots({
  media,
  inView,
  onPick
}: {
  media: readonly ShowcaseMedia[]
  inView: (index: number) => boolean
  onPick: (index: number) => void
}) {
  return (
    <div className="absolute bottom-3.5 left-1/2 flex -translate-x-1/2 rounded-full bg-background px-1 ring-1 ring-foreground/10 group-data-[paged=false]/stage:hidden">
      {media.map((item, index) => (
        <button
          key={item.key}
          type="button"
          aria-label={item.label}
          aria-current={inView(index) || undefined}
          tabIndex={-1}
          onClick={() => onPick(index)}
          className="group/dot grid h-6 min-w-4 place-items-center rounded-full px-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            className={cn(
              'size-1.5 rounded-full bg-foreground/20 transition-[width,background-color] group-hover/dot:bg-foreground/40',
              inView(index) && 'w-4 bg-foreground group-hover/dot:bg-foreground'
            )}
          />
        </button>
      ))}
    </div>
  )
}

export function ShowcaseStage({
  name,
  media,
  shown
}: {
  name: string
  media: readonly ShowcaseMedia[]
  shown: boolean
}) {
  const [api, setApi] = useState<CarouselApi>()
  const view = useStageView(api)
  const paged = view ? view.canScrollPrev || view.canScrollNext : media.length > mostThatFit
  const inView = (index: number) => (view ? view.inView.includes(index) : index < mostThatFit)
  const pick = (index: number) => {
    if (!api || inView(index)) return
    api.scrollTo(Math.min(index, api.scrollSnapList().length - 1))
  }
  return (
    <Carousel
      setApi={setApi}
      opts={stageOptions}
      aria-label={name}
      inert={!shown}
      data-paged={paged}
      className={cn('group/stage col-start-1 row-start-1 min-h-0 min-w-0', !shown && 'invisible')}
    >
      <div
        className={cn(
          'ml-4 h-full md:ml-8 group-data-[paged=false]/stage:mr-4 md:group-data-[paged=false]/stage:mr-8 [&>[data-slot=carousel-content]]:flex [&>[data-slot=carousel-content]]:min-h-full [&>[data-slot=carousel-content]]:flex-col',
          view?.canScrollPrev && !view.canScrollNext && 'mask-l-from-[calc(100%-3rem)]',
          paged && view?.canScrollNext !== false && 'mask-r-from-[calc(100%-3rem)]'
        )}
      >
        <CarouselContent className="grow items-start pt-8 group-data-[paged=false]/stage:justify-center group-data-[paged=true]/stage:pb-12 md:-ml-6 md:pt-10 lg:pt-12">
          {media.map((item, index) => (
            <CarouselItem
              key={item.key}
              aria-label={`${item.label}, ${index + 1} of ${media.length}`}
              className={cn(
                'flex basis-auto md:pl-6',
                item.shape === 'phone' &&
                  'group-data-[paged=true]/stage:basis-[calc((100%-4rem)/2)] md:group-data-[paged=true]/stage:basis-[calc((100%-4.5rem)/3)]',
                item.shape === 'card' && 'self-stretch'
              )}
            >
              <div key={String(shown)} className={mediaFrame(item, index, media.length)}>
                {item.content}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </div>
      <CarouselPrevious
        size="icon-lg"
        aria-label="Previous screens"
        className="left-3 bg-background shadow-md group-data-[paged=false]/stage:hidden"
      />
      <CarouselNext
        size="icon-lg"
        aria-label="Next screens"
        className="right-3 bg-background shadow-md group-data-[paged=false]/stage:hidden"
      />
      <StageDots media={media} inView={inView} onPick={pick} />
    </Carousel>
  )
}
