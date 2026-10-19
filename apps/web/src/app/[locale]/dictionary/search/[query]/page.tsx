import { isASCII } from '@zenbu/dictionary-core/search/query'
import type { Metadata } from 'next'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SearchForm } from '@/components/dictionary/search-form'
import { SearchResults } from '@/components/dictionary/search-results'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { getSearchExamples, type SearchData, searchDictionary } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { isIndexable } from '@/lib/dictionary/results/links'
import { searchSnippet } from '@/lib/dictionary/search-snippet'
import { pageSources, withShownData } from '@/lib/dictionary/sources'
import { searchPath } from '@/lib/dictionary/urls'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { searchQuery } from './query'

type Props = PageProps<'/[locale]/dictionary/search/[query]'>

async function load(params: Props['params'], decoded: boolean) {
  const locale = await localeOf(params)
  const data = await searchDictionary(searchQuery((await params).query, decoded, locale))
  return { locale, data }
}

function snippetOf(data: SearchData, locale: Locale) {
  return searchSnippet(
    {
      query: data.query,
      english: isASCII(data.query),
      words: data.state === 'results' ? data.rows : [],
      hasExamples: data.state === 'results' && data.examples !== null
    },
    locale
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, data } = await load(params, true)
  const { title, description } = snippetOf(data, locale)
  return dictionaryMetadata(searchPath(data.query), locale, title, description, {
    index: isIndexable(data)
  })
}

export default async function SearchResultsPage({ params }: Props) {
  const { locale, data } = await load(params, false)
  const t = getDictionary(locale)
  const examples =
    data.state === 'results' && data.examples?.target.kind === 'inline'
      ? await getSearchExamples(data.query)
      : null
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        locale={locale}
        page={{
          label: fill(t.breadcrumbs.searchQuery, { query: data.query }),
          path: searchPath(data.query),
          lang: 'ja'
        }}
      />
      <SearchForm locale={locale} text={t.searchForm} defaultValue={data.query} />
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {snippetOf(data, locale).heading}
      </h1>
      <SearchResults data={data} examples={examples} locale={locale} />
      {data.state === 'results' ? (
        <SourceCredits
          locale={locale}
          sources={withShownData(pageSources.search, {
            kanji: data.kanji?.details ? [data.kanji.details] : [],
            examples: examples !== null
          })}
        />
      ) : null}
    </main>
  )
}
