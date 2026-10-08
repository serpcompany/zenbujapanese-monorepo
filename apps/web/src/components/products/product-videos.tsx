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
import { linkTo } from '@/lib/site'
import { type AppVideo, videosSectionId, youtubeEmbedUrl } from '@/lib/videos'

const youtubePlayerFeatures =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'

function VideoCard({ video }: { video: AppVideo }) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className="flex w-72 flex-col gap-2 md:w-80">
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
          aria-label={`Play ${video.title}`}
          onClick={() => setPlaying(true)}
          className="group/video relative block aspect-video w-full overflow-hidden rounded-lg bg-neutral-900 ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="absolute top-[14%] left-1/2 w-1/3 -translate-x-1/2 -rotate-4">
            <AppScreenshot screenshot={video.thumbnail} decorative />
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

export function ProductVideos({ videos }: { videos: readonly AppVideo[] }) {
  if (videos.length === 0) return null
  const allVideos = linkTo('videos')
  return (
    <section
      id={videosSectionId}
      className="mx-auto flex w-full max-w-5xl scroll-mt-6 flex-col items-center gap-6 px-4 py-12 md:px-5 md:py-16"
    >
      <h2 id="videos-heading" className={sectionTitleClassName}>
        Watch it work.
      </h2>
      <Carousel
        opts={{ align: 'start' }}
        aria-labelledby="videos-heading"
        className="flex w-full min-w-0 flex-col gap-6"
      >
        <div className="mask-r-from-[calc(100%-3rem)]">
          <CarouselContent className="-ml-3">
            {videos.map((video, index) => (
              <CarouselItem
                key={video.youtubeId}
                aria-label={`${index + 1} of ${videos.length}`}
                className="basis-auto pl-3"
              >
                <VideoCard video={video} />
              </CarouselItem>
            ))}
          </CarouselContent>
        </div>
        <div className="flex items-center justify-center gap-3">
          <CarouselPrevious
            size="icon-lg"
            className="static translate-none rounded-lg"
            aria-label="Previous videos"
          />
          <Link
            href={allVideos.href}
            data-link-target={allVideos.target}
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            See all videos
            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
          </Link>
          <CarouselNext
            size="icon-lg"
            className="static translate-none rounded-lg"
            aria-label="Next videos"
          />
        </div>
      </Carousel>
    </section>
  )
}
