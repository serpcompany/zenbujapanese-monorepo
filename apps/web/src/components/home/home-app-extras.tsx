import type { ReactNode } from 'react'
import {
  FrequencyPreview,
  FuriganaPreview,
  ListPreview,
  PlayerPreview
} from '@/components/home/app-extra-previews'
import { SectionHeading } from '@/components/home/section-heading'
import { Card } from '@/components/ui/card'
import { type AppExtraId, appExtras } from '@/lib/home'
import { cn } from '@/lib/utils'

function ExtraCard({
  id,
  className,
  children
}: {
  id: AppExtraId
  className?: string
  children: ReactNode
}) {
  const { title, body } = appExtras[id]
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <div className="flex flex-col gap-1.5 px-5 pt-4 pb-5">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className="muted-surface order-first flex min-h-52 flex-1 items-center justify-center border-b bg-muted px-5 py-6">
        {children}
      </div>
    </Card>
  )
}

export function HomeAppExtras() {
  return (
    <section
      aria-labelledby="extras-title"
      className="mx-auto w-full max-w-5xl px-4 pb-14 md:px-5 md:pb-20"
    >
      <SectionHeading
        id="extras-title"
        title="Also in the app."
        aside="For everything after the lookup."
        className="mb-9"
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ExtraCard id="player" className="md:col-span-2">
          <PlayerPreview />
        </ExtraCard>
        <ExtraCard id="lists" className="lg:col-start-3 lg:row-span-2 lg:row-start-1">
          <ListPreview />
        </ExtraCard>
        <ExtraCard id="frequency">
          <FrequencyPreview />
        </ExtraCard>
        <ExtraCard id="furigana" className="md:col-span-2 lg:col-span-1">
          <FuriganaPreview />
        </ExtraCard>
      </div>
    </section>
  )
}
