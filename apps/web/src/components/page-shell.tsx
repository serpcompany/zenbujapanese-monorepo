import { Fill } from '@zenbu/ui/lib/fill'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { defaultLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill, formatDate } from '@/lib/i18n/format'
import { pageFor, type SitePath } from '@/lib/pages'

function EnglishPrevails({ path, locale }: { path: SitePath; locale: Locale }) {
  const t = getDictionary(locale).pageShell
  return (
    <p className="text-sm text-muted-foreground">
      <Fill
        template={t.englishPrevails}
        values={{
          english: (
            <Link href={path} hrefLang={defaultLocale} lang={locale}>
              {t.englishVersion}
            </Link>
          )
        }}
      />
    </p>
  )
}

export function PageShell({
  path,
  locale,
  updated,
  englishPrevails = false,
  children
}: {
  path: SitePath
  locale: Locale
  updated?: string
  englishPrevails?: boolean
  children: ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <article className="flex flex-col gap-4 [&_a]:underline [&_h2]:mt-4 [&_h2]:font-medium [&_h2]:text-lg [&_ul]:list-disc [&_ul]:pl-6">
        <h1 className="text-2xl font-semibold">{pageFor(path, locale).title}</h1>
        {updated ? (
          <p className="text-sm text-muted-foreground">
            {fill(getDictionary(locale).pageShell.effective, {
              date: formatDate(updated, locale)
            })}
          </p>
        ) : null}
        {englishPrevails && locale !== defaultLocale ? (
          <EnglishPrevails path={path} locale={locale} />
        ) : null}
        {children}
      </article>
    </main>
  )
}
