import { BookOpenIcon, CameraIcon, LanguagesIcon, ListIcon, TvMinimalPlayIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { AppScreenshot } from '@/components/app-screenshot'
import { AreaShowcase } from '@/components/area-showcase'
import { FrequencyPreview, FuriganaPreview, ListPreview } from '@/components/home/lists-previews'
import { PlayerPreview } from '@/components/home/player-preview'
import { SectionHeading } from '@/components/home/section-heading'
import { VideoCard } from '@/components/products/product-videos'
import type { ShowcaseMedia } from '@/components/showcase-stage'
import {
  type AppArea,
  type AppAreaId,
  type AreaMedia,
  appAreas,
  type DrawnPreviewId
} from '@/lib/app-areas'

const areaIcons: Record<AppAreaId, ReactNode> = {
  dictionary: <BookOpenIcon aria-hidden="true" />,
  'image-search': <CameraIcon aria-hidden="true" />,
  translate: <LanguagesIcon aria-hidden="true" />,
  player: <TvMinimalPlayIcon aria-hidden="true" />,
  lists: <ListIcon aria-hidden="true" />
}

const drawnPreviews: Record<DrawnPreviewId, Pick<ShowcaseMedia, 'shape' | 'content'>> = {
  player: { shape: 'phone', content: <PlayerPreview /> },
  list: { shape: 'card', content: <ListPreview /> },
  frequency: { shape: 'card', content: <FrequencyPreview /> },
  furigana: { shape: 'card', content: <FuriganaPreview /> }
}

function showcaseMedia(media: AreaMedia): ShowcaseMedia {
  switch (media.kind) {
    case 'screenshot':
      return {
        key: media.screenshot.src,
        label: media.label,
        shape: 'phone',
        content: <AppScreenshot screenshot={media.screenshot} className="block w-full" />
      }
    case 'drawn':
      return { key: media.preview, label: media.label, ...drawnPreviews[media.preview] }
    case 'video':
      return {
        key: media.video.youtubeId,
        label: media.label,
        shape: 'card',
        content: <VideoCard video={media.video} className="w-full md:w-full" />
      }
  }
}

export function HomeAreas({ areas = appAreas }: { areas?: readonly AppArea[] }) {
  return (
    <section
      aria-labelledby="areas-title"
      className="mx-auto w-full max-w-5xl px-4 py-14 md:px-5 md:py-20"
    >
      <SectionHeading
        id="areas-title"
        title="One app for reading, watching, and talking"
        description="Five areas, and one dictionary behind all of them."
        className="mb-9"
      />
      <AreaShowcase
        label="Areas of the app"
        areas={areas.map(area => ({
          ...area,
          icon: areaIcons[area.id],
          media: area.media.map(showcaseMedia)
        }))}
      />
    </section>
  )
}
