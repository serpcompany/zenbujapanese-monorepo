import { type KanaScript, kanaScriptOf } from '@zenbu/dictionary-core/browse/kana'
import { minimumIndexedWords } from '@zenbu/dictionary-core/browse/lists'
import { katakana } from '@zenbu/dictionary-core/detail/text'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { KanaInitial, KanaWords, ScriptIndex } from '@/components/dictionary/browse/kana-pages'
import { counted, pagedTitle } from '@/lib/dictionary/browse/copy'
import {
  getKanaIndex,
  getKanaInitial,
  getKanaInitials,
  getKanaWords,
  type KanaInitialPage
} from '@/lib/dictionary/browse/data'
import { kanaPath, pageNumber, scriptPath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { decodeSegment } from '@/lib/dictionary/urls'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { localeOf } from '@/lib/i18n/params'
import { localizedPath } from '@/lib/i18n/paths'

type LocaleParams = { params: Promise<{ locale: string }> }
type PrefixParams = { params: Promise<{ locale: string; prefix: string }> }
type PagedParams = { params: Promise<{ locale: string; prefix: string; page: string }> }

const kanaText = (locale: Locale) => getDictionary(locale).browse.kana

export function scriptIndexRoute(script: KanaScript) {
  return {
    async generateMetadata({ params }: LocaleParams): Promise<Metadata> {
      const locale = await localeOf(params)
      const { total } = await getKanaIndex(script)
      const t = kanaText(locale)
      return dictionaryMetadata(
        scriptPath(script),
        locale,
        t.scripts[script].title,
        counted(t.scriptDescription, total, locale)
      )
    },
    async Page({ params }: LocaleParams) {
      const locale = await localeOf(params)
      const index = await getKanaIndex(script)
      return (
        <ScriptIndex
          index={index}
          heading={kanaText(locale).scripts[script].heading}
          locale={locale}
        />
      )
    }
  }
}

const startingWith = (kana: string, locale: Locale) => fill(kanaText(locale).startingWith, { kana })

async function initialFor(script: KanaScript, initial: string): Promise<KanaInitialPage> {
  const found = await getKanaInitial(script, initial)
  if (!found) notFound()
  return found
}

async function prefixPage(script: KanaScript, segment: string, page: number) {
  const prefix = decodeSegment(segment)
  const kana = Array.from(prefix)
  if (kanaScriptOf(prefix) !== script || kana.length < 1 || kana.length > 2) notFound()
  if (kana.length === 1) {
    return {
      prefix,
      initial: await initialFor(script, prefix),
      words: null,
      katakanaPath: await katakanaCounterpart(script, prefix)
    }
  }
  const [words, initial] = await Promise.all([
    getKanaWords(script, prefix, page),
    getKanaInitial(script, kana[0])
  ])
  if (!words || !initial) notFound()
  return { prefix, initial, words, katakanaPath: null }
}

async function katakanaCounterpart(script: KanaScript, kana: string): Promise<string | null> {
  if (script !== 'hiragana') return null
  const other = katakana(kana)
  return (await getKanaInitials('katakana')).has(other) ? kanaPath('katakana', other) : null
}

function prefixMetadata(
  script: KanaScript,
  prefix: string,
  total: number,
  page: number,
  locale: Locale
) {
  return dictionaryMetadata(
    kanaPath(script, prefix, page),
    locale,
    pagedTitle(startingWith(prefix, locale), page, locale),
    counted(kanaText(locale).prefixDescription, total, locale, { kana: prefix }),
    { index: total >= minimumIndexedWords }
  )
}

function KanaPrefix({
  script,
  found,
  page,
  locale
}: {
  script: KanaScript
  found: Awaited<ReturnType<typeof prefixPage>>
  page: number
  locale: Locale
}) {
  const heading = startingWith(found.prefix, locale)
  return found.words ? (
    <KanaWords
      script={script}
      prefix={found.prefix}
      initial={found.initial}
      words={found.words}
      heading={heading}
      page={page}
      locale={locale}
    />
  ) : (
    <KanaInitial
      script={script}
      initial={found.initial}
      heading={heading}
      katakanaPath={found.katakanaPath}
      locale={locale}
    />
  )
}

export function kanaRoute(script: KanaScript) {
  return {
    async generateMetadata({ params }: PrefixParams): Promise<Metadata> {
      const locale = await localeOf(params)
      const found = await prefixPage(script, (await params).prefix, 1)
      return prefixMetadata(
        script,
        found.prefix,
        found.words?.total ?? found.initial.total,
        1,
        locale
      )
    },
    async Page({ params }: PrefixParams) {
      const locale = await localeOf(params)
      const found = await prefixPage(script, (await params).prefix, 1)
      return <KanaPrefix script={script} found={found} page={1} locale={locale} />
    }
  }
}

async function pagedPrefix(script: KanaScript, params: PagedParams['params']) {
  const locale = await localeOf(params)
  const { prefix, page: segment } = await params
  const number = pageNumber(segment)
  const kana = decodeSegment(prefix)
  if (!number || Array.from(kana).length !== 2 || kanaScriptOf(kana) !== script) notFound()
  if ('redirect' in number) {
    const group = await getKanaInitial(script, Array.from(kana)[0])
    if (!group?.prefixes.some(each => each.kana === kana)) notFound()
    permanentRedirect(localizedPath(kanaPath(script, kana), locale))
  }
  const found = await prefixPage(script, prefix, number.page)
  if (!found.words) notFound()
  return { found, page: number.page, locale }
}

export function kanaPagedRoute(script: KanaScript) {
  return {
    async generateMetadata({ params }: PagedParams): Promise<Metadata> {
      const { found, page, locale } = await pagedPrefix(script, params)
      return prefixMetadata(script, found.prefix, found.words?.total ?? 0, page, locale)
    },
    async Page({ params }: PagedParams) {
      const { found, page, locale } = await pagedPrefix(script, params)
      return <KanaPrefix script={script} found={found} page={page} locale={locale} />
    }
  }
}
