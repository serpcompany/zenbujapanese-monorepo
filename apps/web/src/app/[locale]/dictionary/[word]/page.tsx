import { SourceCredits } from '@zenbu/ui/dictionary/source-credits'
import { WordHeader } from '@zenbu/ui/dictionary/word-header'
import { WordSections } from '@zenbu/ui/dictionary/word-sections'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { PageToolbar } from '@/components/dictionary/page-toolbar'
import { wordHeaderIn, wordSectionsProps } from '@/components/dictionary/word-page-props'
import { wordItem } from '@/lib/account/saved-item'
import { getWordPage } from '@/lib/dictionary/data'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { sourceCreditsIn } from '@/lib/dictionary/screen-text'
import { pageSources, withShownData } from '@/lib/dictionary/sources'
import { decodeSegment, parseWordSegment } from '@/lib/dictionary/urls'
import { wordDescription, wordTitle } from '@/lib/dictionary/word-snippet'
import { localeOf } from '@/lib/i18n/params'
import { localizedPath } from '@/lib/i18n/paths'

type Props = PageProps<'/[locale]/dictionary/[word]'>

async function load(params: Props['params']) {
  const locale = await localeOf(params)
  const segment = (await params).word
  const parsed = parseWordSegment(segment)
  if (!parsed) notFound()
  const word = await getWordPage(parsed.entSeq)
  if (!word) notFound()
  if (decodeSegment(segment) !== `${word.slug}-${word.entSeq}`) {
    permanentRedirect(encodeURI(localizedPath(word.path, locale)))
  }
  return { locale, word }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, word } = await load(params)
  return dictionaryMetadata(
    encodeURI(word.path),
    locale,
    wordTitle(word, locale),
    wordDescription(word, locale)
  )
}

export default async function WordPage({ params }: Props) {
  const { locale, word } = await load(params)
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-4 pb-6" data-reading-aids>
      <PageToolbar
        page={{ label: word.headword, path: word.path, lang: 'ja' }}
        shareText={word.shareText}
        item={wordItem(word)}
        locale={locale}
      />

      <WordHeader {...wordHeaderIn(word, locale)} />

      <WordSections {...wordSectionsProps(word, locale)} />

      <SourceCredits
        {...sourceCreditsIn(
          withShownData(pageSources.word, {
            kanji: [...word.kanji, ...word.alternativeKanji].flatMap(item =>
              item.details ? [item.details] : []
            )
          }),
          locale
        )}
      />
    </main>
  )
}
