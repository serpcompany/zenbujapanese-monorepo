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
  appAreasIn,
  type DrawnPreviewId
} from '@/lib/app-areas'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'

const areaIcons: Record<AppAreaId, ReactNode> = {
  dictionary: <BookOpenIcon aria-hidden="true" />,
  'image-search': <CameraIcon aria-hidden="true" />,
  translate: <LanguagesIcon aria-hidden="true" />,
  player: <TvMinimalPlayIcon aria-hidden="true" />,
  lists: <ListIcon aria-hidden="true" />
}

const drawnPreviews = (
  locale: Locale,
  tapKanji: string
): Record<DrawnPreviewId, Pick<ShowcaseMedia, 'shape' | 'content'>> => ({
  player: { shape: 'phone', content: <PlayerPreview locale={locale} /> },
  list: { shape: 'card', content: <ListPreview locale={locale} /> },
  frequency: { shape: 'card', content: <FrequencyPreview locale={locale} /> },
  furigana: { shape: 'card', content: <FuriganaPreview tapKanji={tapKanji} /> }
})

function showcaseMedia(
  media: AreaMedia,
  drawn: ReturnType<typeof drawnPreviews>,
  play: string
): ShowcaseMedia {
  switch (media.kind) {
    case 'screenshot':
      return {
        key: media.screenshot.src,
        label: media.label,
        shape: 'phone',
        content: <AppScreenshot screenshot={media.screenshot} className="block w-full" />
      }
    case 'drawn':
      return { key: media.preview, label: media.label, ...drawn[media.preview] }
    case 'video':
      return {
        key: media.video.youtubeId,
        label: media.label,
        shape: 'card',
        content: <VideoCard video={media.video} play={play} className="w-full md:w-full" />
      }
  }
}

export function HomeAreas({
  locale,
  areas = appAreasIn(locale)
}: {
  locale: Locale
  areas?: readonly AppArea[]
}) {
  const t = getDictionary(locale)
  const text = t.home.areas
  const drawn = drawnPreviews(locale, text.tapKanji)
  return (
    <section
      aria-labelledby="areas-title"
      className="mx-auto w-full max-w-5xl px-4 py-14 md:px-5 md:py-20"
    >
      <SectionHeading
        id="areas-title"
        title={text.title}
        description={text.description}
        className="mb-9"
      />
      <AreaShowcase
        label={text.label}
        text={{ previous: text.previous, next: text.next, slide: text.slide }}
        areas={areas.map(area => ({
          ...area,
          icon: areaIcons[area.id],
          media: area.media.map(media => showcaseMedia(media, drawn, t.productPage.videos.play))
        }))}
      />
    </section>
  )
}
