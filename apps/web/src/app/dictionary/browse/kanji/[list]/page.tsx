import { kanjiList } from '@zenbu/dictionary-core/browse/lists'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { KanjiListPage } from '@/components/dictionary/browse/kanji-pages'
import { kanjiListIntro } from '@/lib/dictionary/browse/copy'
import { getKanjiList } from '@/lib/dictionary/browse/data'
import { kanjiListPath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

type Props = PageProps<'/dictionary/browse/kanji/[list]'>

async function load(params: Props['params']) {
  const slug = (await params).list
  const list = kanjiList(slug)
  const kanji = list ? await getKanjiList(slug) : null
  if (!list || !kanji) notFound()
  return { list, kanji, intro: kanjiListIntro(list, kanji.kanji.length) }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { list, intro } = await load(params)
  return dictionaryMetadata(kanjiListPath(list.slug), `${list.name} kanji`, intro)
}

export default async function KanjiListRoute({ params }: Props) {
  const { list, kanji, intro } = await load(params)
  return <KanjiListPage list={list} kanji={kanji} intro={intro} />
}
