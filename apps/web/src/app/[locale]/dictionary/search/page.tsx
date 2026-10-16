import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SearchForm } from '@/components/dictionary/search-form'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { hasSearchPath, searchPath } from '@/lib/dictionary/urls'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { localizedPath } from '@/lib/i18n/paths'

type Props = PageProps<'/[locale]/dictionary/search'>

const indexPath = '/dictionary/search/'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await localeOf(params)
  const { title, description } = getDictionary(locale).search.index
  return dictionaryMetadata(indexPath, locale, title, description, { index: false })
}

export default async function SearchIndexPage({ params, searchParams }: Props) {
  const locale = await localeOf(params)
  const t = getDictionary(locale)
  const { q } = await searchParams
  const query = normalizeQuery(typeof q === 'string' ? q : '')
  if (query && hasSearchPath(query)) permanentRedirect(localizedPath(searchPath(query), locale))
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        locale={locale}
        page={{ label: t.breadcrumbs.search, path: indexPath }}
      />
      <SearchForm locale={locale} text={t.searchForm} autoFocus defaultValue={query || undefined} />
      <h1 className="text-2xl font-semibold tracking-tight">{t.search.index.title}</h1>
      {query ? (
        <p className="text-muted-foreground">{fill(t.search.index.noMatch, { query })}</p>
      ) : null}
    </main>
  )
}
