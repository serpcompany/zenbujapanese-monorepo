import { CheckIcon, SearchIcon } from 'lucide-react'
import Link from 'next/link'
import { AppScreenshot } from '@/components/app-screenshot'
import { SearchForm } from '@/components/dictionary/search-form'
import { GetAppButton } from '@/components/site-actions'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { appScreenshots } from '@/lib/app-screenshots'
import { exampleSearches } from '@/lib/home'
import { cn } from '@/lib/utils'

const heroButton = 'h-11 px-4.5 text-[0.9375rem]'

const promises = ['No account', 'No ads', 'Your words stay on your iPhone']

function HeroScreenshots() {
  return (
    <div className="relative mx-auto aspect-[1/1.34] w-full max-w-76 md:max-w-88 lg:max-w-100">
      <AppScreenshot
        screenshot={appScreenshots.searchResults}
        eager
        className="absolute top-[11%] left-0 w-1/2"
      />
      <AppScreenshot
        screenshot={appScreenshots.wordDetail}
        eager
        className="absolute top-0 right-[2%] w-[60%]"
      />
    </div>
  )
}

export function HomeHero() {
  return (
    <section
      aria-labelledby="home-title"
      className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 pt-10 pb-12 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:px-5 md:pt-16 md:pb-18"
    >
      <div className="flex min-w-0 flex-col items-start gap-5">
        <Badge variant="outline">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-green-500" />
          For iPhone · Offline dictionary
        </Badge>
        <h1
          id="home-title"
          className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance md:text-[2.75rem] lg:text-[3.25rem]"
        >
          Understand the Japanese you meet
        </h1>
        <p className="max-w-xl text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground">
          Look up any word offline. Point your camera at a menu, draw a kanji you can’t type, and
          talk through a conversation in Japanese and English, all on your iPhone.
        </p>
        <div className="flex flex-wrap gap-2">
          <GetAppButton size="lg" className={heroButton} />
          <Link
            href="/dictionary/"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), heroButton)}
          >
            <SearchIcon data-icon="inline-start" aria-hidden="true" />
            Search the dictionary
          </Link>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground">
          {promises.map(promise => (
            <li key={promise} className="inline-flex items-center gap-1.5">
              <CheckIcon aria-hidden="true" className="size-3.5" />
              {promise}
            </li>
          ))}
        </ul>
      </div>
      <HeroScreenshots />
    </section>
  )
}

export function TryDictionary() {
  return (
    <section aria-labelledby="try-title" className="mx-auto w-full max-w-5xl px-4 md:px-5">
      <Card className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center md:gap-x-8 md:gap-y-3 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="try-title" className="text-lg font-semibold tracking-tight">
            Try the dictionary
          </h2>
          <p className="text-[0.9375rem] text-muted-foreground">
            The app’s dictionary, free on the web. Search in Japanese, kana, romaji, or English.
          </p>
        </div>
        <SearchForm />
        <div className="flex flex-wrap items-center gap-1.5 text-sm md:col-start-2">
          <span id="try-examples" className="text-muted-foreground">
            Try
          </span>
          <ul aria-labelledby="try-examples" className="flex flex-wrap gap-1.5">
            {exampleSearches.map(example => (
              <li key={example.query}>
                <Link
                  href={example.path}
                  lang={example.lang}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'rounded-full px-3 text-sm font-normal'
                  )}
                >
                  {example.query}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </section>
  )
}
