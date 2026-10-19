'use client'

import { ArrowRightIcon, PlayIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { AppScreenshot } from '@/components/app-screenshot'
import { sectionTitleClassName } from '@/components/products/section-title'
import { buttonVariants } from '@/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@/components/ui/carousel'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
import { linkTo } from '@/lib/site'
import { cn } from '@/lib/utils'
import { type AppVideo, videosSectionId, youtubeEmbedUrl } from '@/lib/videos'

const youtubePlayerFeatures =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'

export function VideoCard({
  video,
  play,
  className
}: {
  video: AppVideo
  play: string
  className?: string
}) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className={cn('flex w-72 flex-col gap-2 md:w-80', className)}>
      {playing ? (
        <iframe
          ref={player => player?.focus()}
          src={youtubeEmbedUrl(video.youtubeId)}
          title={video.title}
          allow={youtubePlayerFeatures}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="aspect-video w-full rounded-lg bg-neutral-900"
        />
      ) : (
        <button
          type="button"
          aria-label={fill(play, { title: video.title })}
          onClick={() => setPlaying(true)}
          className="group/video relative block aspect-video w-full overflow-hidden rounded-lg bg-neutral-900 ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="absolute top-[14%] left-1/2 w-1/3 -translate-x-1/2 -rotate-4">
            <AppScreenshot screenshot={video.thumbnail} decorative className="block w-full" />
          </span>
          <span className="absolute bottom-2 left-2 grid size-8 place-items-center rounded-full bg-white text-neutral-950 shadow-lg transition-transform group-hover/video:scale-110">
            <PlayIcon aria-hidden="true" className="ml-0.5 size-4 fill-current" />
          </span>
        </button>
      )}
      <p className="text-[13px] leading-snug font-medium">{video.title}</p>
    </div>
  )
}

export function ProductVideos({
  videos,
  locale,
  text,
  carousel
}: {
  videos: readonly AppVideo[]
  locale: Locale
  text: Dictionary['productPage']['videos']
  carousel: Dictionary['productPage']['carousel']
}) {
  if (videos.length === 0) return null
  const allVideos = linkTo('videos')
  return (
    <section
      id={videosSectionId}
      className="mx-auto flex w-full max-w-5xl scroll-mt-6 flex-col items-center gap-6 px-4 py-12 md:px-5 md:py-16"
    >
      <h2 id="videos-heading" className={sectionTitleClassName}>
        {text.heading}
      </h2>
      <Carousel
        opts={{ align: 'start' }}
        aria-roledescription={carousel.region}
        aria-labelledby="videos-heading"
        className="flex w-full min-w-0 flex-col gap-6"
      >
        <div className="mask-r-from-[calc(100%-3rem)]">
          <CarouselContent className="-ml-3">
            {videos.map((video, index) => (
              <CarouselItem
                key={video.youtubeId}
                aria-roledescription={carousel.slide}
                aria-label={fill(carousel.position, { index: index + 1, count: videos.length })}
                className="basis-auto pl-3"
              >
                <VideoCard video={video} play={text.play} />
              </CarouselItem>
            ))}
          </CarouselContent>
        </div>
        <div className="flex items-center justify-center gap-3">
          <CarouselPrevious
            size="icon-lg"
            className="static translate-none rounded-lg"
            aria-label={text.previous}
          />
          <Link
            href={localizedPath(allVideos.href, locale)}
            data-link-target={allVideos.target}
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            {text.seeAll}
            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
          </Link>
          <CarouselNext
            size="icon-lg"
            className="static translate-none rounded-lg"
            aria-label={text.next}
          />
        </div>
      </Carousel>
    </section>
  )
}
