import { type KanaScript, kanaScriptOf } from '@zenbu/dictionary-core/browse/kana'
import { katakana } from '@zenbu/dictionary-core/detail/text'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { KanaInitial, KanaWords, ScriptIndex } from '@/components/dictionary/browse/kana-pages'
import { plural } from '@/lib/dictionary/browse/copy'
import {
  getKanaIndex,
  getKanaInitial,
  getKanaWords,
  type KanaInitialPage
} from '@/lib/dictionary/browse/data'
import { kanaPath, pageNumber, scriptPath } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'
import { decodeSegment } from '@/lib/dictionary/urls'

type PrefixParams = { params: Promise<{ prefix: string }> }
type PagedParams = { params: Promise<{ prefix: string; page: string }> }

const scriptHeadings: Record<KanaScript, { title: string; heading: string }> = {
  hiragana: {
    title: 'Japanese words by hiragana',
    heading: 'Japanese words by hiragana, from あ to ん'
  },
  katakana: { title: 'Japanese katakana words', heading: 'Japanese katakana words, from ア to ン' }
}

export function scriptIndexRoute(script: KanaScript) {
  return {
    async generateMetadata(): Promise<Metadata> {
      const { total } = await getKanaIndex(script)
      return dictionaryMetadata(
        scriptPath(script),
        scriptHeadings[script].title,
        `${plural(total, 'Japanese word')}, by the first kana of their reading.`
      )
    },
    async Page() {
      const index = await getKanaIndex(script)
      return <ScriptIndex index={index} heading={scriptHeadings[script].heading} />
    }
  }
}

const startingWith = (kana: string) => `Japanese words starting with ${kana}`

async function initialFor(script: KanaScript, initial: string): Promise<KanaInitialPage> {
  const found = await getKanaInitial(script, initial)
  if (!found) notFound()
  return found
}

async function prefixPage(script: KanaScript, segment: string, page: number) {
  const prefix = decodeSegment(segment)
  const kana = Array.from(prefix)
  if (kanaScriptOf(prefix) !== script || kana.length < 1 || kana.length > 2) notFound()
  if (kana.length === 1) return { prefix, initial: await initialFor(script, prefix), words: null }
  const [words, initial] = await Promise.all([
    getKanaWords(script, prefix, page),
    getKanaInitial(script, kana[0])
  ])
  if (!words || !initial) notFound()
  return { prefix, initial, words }
}

const counterpart = (script: KanaScript, kana: string) =>
  script === 'hiragana' ? katakana(kana) : null

function prefixMetadata(script: KanaScript, prefix: string, total: number, page: number) {
  const paged = page > 1 ? `, page ${page}` : ''
  return dictionaryMetadata(
    kanaPath(script, prefix, page),
    `${startingWith(prefix)}${paged}`,
    `${plural(total, 'Japanese word')} whose reading starts with ${prefix}, with their meanings.`
  )
}

function KanaPrefix({
  script,
  found,
  page
}: {
  script: KanaScript
  found: Awaited<ReturnType<typeof prefixPage>>
  page: number
}) {
  const other = counterpart(script, found.initial.initial)
  return found.words ? (
    <KanaWords
      script={script}
      prefix={found.prefix}
      initial={found.initial}
      words={found.words}
      heading={startingWith(found.prefix)}
      page={page}
    />
  ) : (
    <KanaInitial
      script={script}
      initial={found.initial}
      heading={startingWith(found.prefix)}
      katakanaPath={other ? kanaPath('katakana', other) : null}
    />
  )
}

export function kanaRoute(script: KanaScript) {
  return {
    async generateMetadata({ params }: PrefixParams): Promise<Metadata> {
      const found = await prefixPage(script, (await params).prefix, 1)
      return prefixMetadata(script, found.prefix, found.words?.total ?? found.initial.total, 1)
    },
    async Page({ params }: PrefixParams) {
      const found = await prefixPage(script, (await params).prefix, 1)
      return <KanaPrefix script={script} found={found} page={1} />
    }
  }
}

async function pagedPrefix(script: KanaScript, params: PagedParams['params']) {
  const { prefix, page: segment } = await params
  const number = pageNumber(segment)
  if (!number) notFound()
  if ('redirect' in number) permanentRedirect(kanaPath(script, decodeSegment(prefix)))
  const found = await prefixPage(script, prefix, number.page)
  if (!found.words) notFound()
  return { found, page: number.page }
}

export function kanaPagedRoute(script: KanaScript) {
  return {
    async generateMetadata({ params }: PagedParams): Promise<Metadata> {
      const { found, page } = await pagedPrefix(script, params)
      return prefixMetadata(script, found.prefix, found.words?.total ?? 0, page)
    },
    async Page({ params }: PagedParams) {
      const { found, page } = await pagedPrefix(script, params)
      return <KanaPrefix script={script} found={found} page={page} />
    }
  }
}
