import Link from 'next/link'
import { SearchForm } from '@/components/dictionary/search-form'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { exampleSearches } from '@/lib/home'
import { cn } from '@/lib/utils'

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
