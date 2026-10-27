import { isASCII } from '@zenbu/dictionary-core/search/query'
import { SourceCredits } from '@zenbu/ui/dictionary/source-credits'
import type { Metadata } from 'next'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { SearchForm } from '@/components/dictionary/search-form'
import { SearchResults } from '@/components/dictionary/search-results'
import { getSearchExamples, type SearchData, searchDictionary } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { startedFromRadicals } from '@/lib/dictionary/radical-input'
import { isIndexable } from '@/lib/dictionary/results/links'
import { sourceCreditsIn } from '@/lib/dictionary/screen-text'
import { searchSnippet, showsExampleSentences } from '@/lib/dictionary/search-snippet'
import { pageSources, withShownData } from '@/lib/dictionary/sources'
import { searchPath } from '@/lib/dictionary/urls'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { searchQuery } from './query'

type Props = PageProps<'/[locale]/dictionary/search/[query]'>

async function load(params: Props['params'], decoded: boolean, pickedKanji = false) {
  const locale = await localeOf(params)
  const query = searchQuery((await params).query, decoded, locale)
  const data = await searchDictionary(query, pickedKanji)
  return { locale, data }
}

function snippetOf(data: SearchData, locale: Locale) {
  return searchSnippet(
    {
      query: data.query,
      english: isASCII(data.query),
      words: data.state === 'results' ? data.rows : [],
      hasExamples: showsExampleSentences(data)
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

export default async function SearchResultsPage({ params, searchParams }: Props) {
  const { locale, data } = await load(params, false, startedFromRadicals(await searchParams))
  const t = getDictionary(locale)
  const examples = showsExampleSentences(data) ? await getSearchExamples(data.query) : null
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-4 pb-6" data-reading-aids>
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
          {...sourceCreditsIn(
            withShownData(pageSources.search, {
              kanji: data.kanji?.details ? [data.kanji.details] : [],
              examples: examples !== null
            }),
            locale
          )}
        />
      ) : null}
    </main>
  )
}
