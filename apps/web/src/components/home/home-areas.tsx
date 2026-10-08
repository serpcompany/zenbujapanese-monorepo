import { BookOpenIcon, CameraIcon, LanguagesIcon, type LucideIcon, TvIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { AppScreenshot } from '@/components/app-screenshot'
import { AreaShowcase } from '@/components/area-showcase'
import { PlayerPreview } from '@/components/home/player-preview'
import { SectionHeading } from '@/components/home/section-heading'
import { appScreenshots, type AppScreenshot as Screenshot } from '@/lib/app-screenshots'
import { type AppAreaId, appAreas } from '@/lib/home'

const areaIcons: Record<AppAreaId, LucideIcon> = {
  dictionary: BookOpenIcon,
  'image-search': CameraIcon,
  translate: LanguagesIcon,
  player: TvIcon
}

const screenshotPreview = (screenshot: Screenshot) => (
  <AppScreenshot screenshot={screenshot} className="w-54 shrink-0 self-start md:w-60 lg:w-64" />
)

const areaPreviews: Record<AppAreaId, ReactNode> = {
  dictionary: screenshotPreview(appScreenshots.conjugations),
  'image-search': screenshotPreview(appScreenshots.imageSearch),
  translate: screenshotPreview(appScreenshots.translate),
  player: <PlayerPreview />
}

export function HomeAreas() {
  return (
    <section
      aria-labelledby="areas-title"
      className="mx-auto w-full max-w-5xl px-4 py-14 md:px-5 md:py-20"
    >
      <SectionHeading
        id="areas-title"
        title="One app for reading, watching, and talking"
        description="Four areas, and one dictionary behind all of them."
        className="mb-9"
      />
      <AreaShowcase
        label="Areas of the app"
        areas={appAreas.map(area => ({
          ...area,
          icon: areaIcons[area.id],
          preview: areaPreviews[area.id]
        }))}
      />
    </section>
  )
}
