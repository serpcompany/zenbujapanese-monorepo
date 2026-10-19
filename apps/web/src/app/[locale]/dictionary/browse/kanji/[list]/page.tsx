import { kanjiList, minimumIndexedWords } from '@zenbu/dictionary-core/browse/lists'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { KanjiListPage } from '@/components/dictionary/browse/kanji-pages'
import {
  kanjiListDescription,
  kanjiListHeading,
  kanjiListIntro
} from '@/lib/dictionary/browse/copy'
import { getKanjiList } from '@/lib/dictionary/browse/data'
import { kanjiListPath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { localeOf } from '@/lib/i18n/params'

type Props = PageProps<'/[locale]/dictionary/browse/kanji/[list]'>

async function load(params: Props['params']) {
  const locale = await localeOf(params)
  const slug = (await params).list
  const list = kanjiList(slug)
  const kanji = list ? await getKanjiList(slug) : null
  if (!list || !kanji) notFound()
  return { list, kanji, locale, intro: kanjiListIntro(list, kanji.kanji.length, locale) }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { list, kanji, locale } = await load(params)
  return dictionaryMetadata(
    kanjiListPath(list.slug),
    locale,
    kanjiListHeading(list, locale),
    kanjiListDescription(list, kanji.kanji.length, locale),
    { index: kanji.kanji.length >= minimumIndexedWords }
  )
}

export default async function KanjiListRoute({ params }: Props) {
  const { list, kanji, intro, locale } = await load(params)
  return <KanjiListPage list={list} kanji={kanji} intro={intro} locale={locale} />
}
