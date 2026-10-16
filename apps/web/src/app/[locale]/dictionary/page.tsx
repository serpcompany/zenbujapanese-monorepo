import type { Metadata } from 'next'
import { DictionaryHomeSections } from '@/components/dictionary/browse/home-sections'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SearchForm } from '@/components/dictionary/search-form'
import { getHomeBrowse } from '@/lib/dictionary/browse/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localeOf } from '@/lib/i18n/params'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params
}: PageProps<'/[locale]/dictionary'>): Promise<Metadata> {
  const locale = await localeOf(params)
  const { title, description } = getDictionary(locale).pages['/dictionary/']
  return dictionaryMetadata('/dictionary/', locale, title, description)
}

export default async function DictionaryPage({ params }: PageProps<'/[locale]/dictionary'>) {
  const locale = await localeOf(params)
  const t = getDictionary(locale)
  const browse = await getHomeBrowse()
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pt-4 pb-16">
      <DictionaryBreadcrumbs locale={locale} />
      <section className="mx-auto flex min-h-[70svh] w-full max-w-2xl flex-col items-center justify-center gap-8 pt-10 pb-[12vh] text-center">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {t.dictionary.title}
          </h1>
          <p className="max-w-lg text-lg text-balance text-muted-foreground">{t.dictionary.lead}</p>
        </div>
        <div className="w-full max-w-xl">
          <SearchForm locale={locale} text={t.searchForm} autoFocus />
        </div>
      </section>
      {browse ? (
        <DictionaryHomeSections
          summary={browse.summary}
          hiragana={browse.hiragana}
          locale={locale}
        />
      ) : null}
    </main>
  )
}
