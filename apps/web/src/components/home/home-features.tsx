import { BookOpenIcon, CameraIcon, LanguagesIcon, type LucideIcon, PenLineIcon } from 'lucide-react'
import { AppScreenshot } from '@/components/app-screenshot'
import { SectionHeading } from '@/components/home/section-heading'
import { type AppFeature, type AppFeatureId, appFeatures } from '@/lib/home'
import { cn } from '@/lib/utils'

const featureIcons: Record<AppFeatureId, LucideIcon> = {
  'image-search': CameraIcon,
  handwriting: PenLineIcon,
  dictionary: BookOpenIcon,
  translate: LanguagesIcon
}

function Feature({ feature, screenshotFirst }: { feature: AppFeature; screenshotFirst: boolean }) {
  const Icon = featureIcons[feature.id]
  const titleId = `feature-${feature.id}`
  return (
    <article aria-labelledby={titleId} className="grid items-center gap-6 md:grid-cols-2 md:gap-12">
      <div className="flex min-w-0 flex-col gap-3.5">
        <p className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
          {feature.name}
        </p>
        <h3
          id={titleId}
          className="text-xl leading-tight font-semibold tracking-tight text-balance"
        >
          {feature.title}
        </h3>
        <p className="leading-relaxed text-muted-foreground">{feature.body}</p>
      </div>
      <div
        className={cn(
          'flex h-84 justify-center overflow-hidden rounded-2xl bg-muted md:h-96 lg:h-104',
          feature.shows === 'top' ? 'items-start pt-8' : 'items-end pb-8',
          screenshotFirst && 'md:order-first'
        )}
      >
        <AppScreenshot screenshot={feature.screenshot} className="w-54 shrink-0 md:w-60 lg:w-64" />
      </div>
    </article>
  )
}

export function HomeFeatures() {
  return (
    <section
      aria-labelledby="features-title"
      className="mx-auto w-full max-w-5xl px-4 py-14 md:px-5 md:py-20"
    >
      <SectionHeading
        id="features-title"
        title="One app for reading, writing, and talking"
        description="Four ways in, and one dictionary behind all of them."
        className="mb-9"
      />
      <div className="flex flex-col gap-14">
        {appFeatures.map((feature, index) => (
          <Feature key={feature.id} feature={feature} screenshotFirst={index % 2 === 1} />
        ))}
      </div>
    </section>
  )
}
