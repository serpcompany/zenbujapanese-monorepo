import { ChevronRightIcon, SearchXIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { DictionaryBreadcrumbs } from '@/components/dictionary/dictionary-breadcrumbs'
import { FrequencyBadges } from '@/components/dictionary/frequency'
import { RubyText } from '@/components/dictionary/ruby-text'
import { SearchForm } from '@/components/dictionary/search-form'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemGroup, ItemSeparator } from '@/components/ui/item'
import { isDictionaryAvailable, searchDictionary } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { decodeSegment, normalizeSearchQuery, searchPath } from '@/lib/dictionary/urls'

type Props = PageProps<'/dictionary/search/[query]'>

// Next.js passes the page an encoded segment but generateMetadata a decoded one.
async function load(params: Props['params'], decoded: boolean) {
  if (!isDictionaryAvailable()) notFound()
  const segment = (await params).query
  const raw = decoded ? segment : decodeSegment(segment)
  const query = normalizeSearchQuery(raw)
  if (!query) permanentRedirect('/dictionary/search/')
  if (query !== raw) permanentRedirect(searchPath(query))
  return searchDictionary(query)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const results = await load(params, true)
  const found = results.words.length > 0 || results.kanji !== null
  return dictionaryMetadata(
    searchPath(results.query),
    `${results.query} in Japanese`,
    found
      ? `${results.words.length} Japanese words for “${results.query}”, with readings and meanings.`
      : `No Japanese words match “${results.query}”.`,
    { index: found }
  )
}

export default async function SearchResultsPage({ params }: Props) {
  const { query, kanji, words } = await load(params, false)
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-6">
      <DictionaryBreadcrumbs
        page={{ label: `Search: ${query}`, path: searchPath(query), lang: 'ja' }}
      />
      <SearchForm defaultValue={query} />
      {words.length === 0 && !kanji ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No words match “{query}”</EmptyTitle>
            <EmptyDescription>
              Try the dictionary form, kana, romaji, or an English meaning.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {words.length} {words.length === 1 ? 'word' : 'words'} for{' '}
            <span lang="ja" className="text-foreground">
              {query}
            </span>
          </p>
          {kanji ? (
            <Card className="py-0">
              <Item render={<Link href={kanji.path} />}>
                <span lang="ja" className="text-4xl">
                  {kanji.character}
                </span>
                <ItemContent>
                  <p className="font-medium">Kanji</p>
                  <p className="text-muted-foreground">{kanji.meanings.join(', ')}</p>
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            </Card>
          ) : null}
          <Card className="py-2">
            <ItemGroup className="gap-0">
              {words.map((word, position) => (
                <div key={word.entSeq}>
                  {position > 0 ? <ItemSeparator className="my-0" /> : null}
                  <Item render={<Link href={word.path} />} className="rounded-none px-4">
                    <ItemContent className="gap-1.5">
                      <RubyText
                        segments={word.ruby}
                        className="text-2xl font-medium leading-tight"
                      />
                      <p className="text-sm">{word.summary}</p>
                      <FrequencyBadges frequency={word.frequency} />
                    </ItemContent>
                    <ItemActions>
                      <ChevronRightIcon className="size-4 text-muted-foreground" />
                    </ItemActions>
                  </Item>
                </div>
              ))}
            </ItemGroup>
          </Card>
        </>
      )}
    </main>
  )
}
