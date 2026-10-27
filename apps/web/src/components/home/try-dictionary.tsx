import { buttonVariants } from '@zenbu/ui/components/button'
import { Card } from '@zenbu/ui/components/card'
import Link from 'next/link'
import { SearchForm } from '@/components/dictionary/search-form'
import { exampleSearchesIn } from '@/lib/home'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { cn } from '@/lib/utils'

export function TryDictionary({ locale }: { locale: Locale }) {
  const t = getDictionary(locale)
  const text = t.home.try
  return (
    <section aria-labelledby="try-title" className="mx-auto w-full max-w-5xl px-4 md:px-5">
      <Card className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center md:gap-x-8 md:gap-y-3 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="try-title" className="text-lg font-semibold tracking-tight">
            {text.title}
          </h2>
          <p className="text-[0.9375rem] text-muted-foreground">{text.description}</p>
        </div>
        <SearchForm locale={locale} text={t.searchForm} />
        <div className="flex flex-wrap items-center gap-1.5 text-sm md:col-start-2">
          <span id="try-examples" className="text-muted-foreground">
            {text.examples}
          </span>
          <ul aria-labelledby="try-examples" className="flex flex-wrap gap-1.5">
            {exampleSearchesIn(locale).map(example => (
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
