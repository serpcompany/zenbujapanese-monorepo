import { CheckIcon, SearchIcon } from 'lucide-react'
import Link from 'next/link'
import { AppScreenshot } from '@/components/app-screenshot'
import { callToAction } from '@/components/home/home-styles'
import { GetAppButton } from '@/components/site-actions'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { appScreenshotsIn } from '@/lib/app-screenshots'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { cn } from '@/lib/utils'

function HeroScreenshots({ locale }: { locale: Locale }) {
  const shots = appScreenshotsIn(locale)
  return (
    <div className="relative mx-auto aspect-[1/1.34] w-full max-w-76 md:max-w-88 lg:max-w-100">
      <AppScreenshot
        screenshot={shots.searchResults}
        eager
        className="absolute top-[11%] left-0 w-1/2"
      />
      <AppScreenshot
        screenshot={shots.wordDetail}
        eager
        className="absolute top-0 right-[2%] w-[60%]"
      />
    </div>
  )
}

export function HomeHero({ locale }: { locale: Locale }) {
  const t = getDictionary(locale)
  const text = t.home.hero
  return (
    <section
      aria-labelledby="home-title"
      className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 pt-10 pb-12 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:px-5 md:pt-16 md:pb-18"
    >
      <div className="flex min-w-0 flex-col items-start gap-5">
        <Badge variant="outline">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-green-500" />
          {text.badge}
        </Badge>
        <h1
          id="home-title"
          className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance md:text-[2.75rem] lg:text-[3.25rem]"
        >
          {text.title}
        </h1>
        <p className="max-w-xl text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground">
          {text.lead}
        </p>
        <div className="flex flex-wrap gap-2">
          <GetAppButton
            locale={locale}
            label={t.chrome.getTheApp}
            size="lg"
            className={callToAction}
          />
          <Link
            href={localizedPath('/dictionary/', locale)}
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), callToAction)}
          >
            <SearchIcon data-icon="inline-start" aria-hidden="true" />
            {text.searchDictionary}
          </Link>
        </div>
        <p className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
          <CheckIcon aria-hidden="true" className="size-3.5" />
          {text.worksOffline}
        </p>
      </div>
      <HeroScreenshots locale={locale} />
    </section>
  )
}
