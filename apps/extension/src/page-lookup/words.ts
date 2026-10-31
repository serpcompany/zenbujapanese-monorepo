import type { PageSegmentedToken } from '@zenbu/dictionary-core/cards/segmentation'
import { attachment } from '@zenbu/dictionary-core/detail/romaji'
import { type RubySegment, rubySegments } from '@zenbu/dictionary-core/detail/ruby'
import { hiragana } from '@zenbu/dictionary-core/detail/text'

export type PageToken = {
  start: number
  end: number
  text: string
  ids: string[]
  linked: string | null
  ruby: RubySegment[]
}

const kana = /^[\p{sc=Hiragana}\p{sc=Katakana}ー]+$/u

const linkedIds = ({ languageReferenceID, candidates, writtenAlike = [] }: PageSegmentedToken) =>
  languageReferenceID ? [languageReferenceID, ...writtenAlike] : (candidates ?? [])

function ruby({ text, reading }: PageSegmentedToken): RubySegment[] {
  return reading && kana.test(reading) ? rubySegments(text, hiragana(reading)) : [{ text }]
}

export function pageTokens(
  tokens: readonly PageSegmentedToken[],
  text: string,
  offset = 0
): PageToken[] | null {
  let at = 0
  const placed: PageToken[] = []
  for (const token of tokens) {
    if (token.text === '' || !text.startsWith(token.text, at)) return null
    const start = offset + at
    placed.push({
      start,
      end: start + token.text.length,
      text: token.text,
      ids: linkedIds(token),
      linked: token.languageReferenceID ?? null,
      ruby: ruby(token)
    })
    at += token.text.length
  }
  return at === text.length ? placed : null
}

export function wordGroups(tokens: readonly PageToken[]): PageToken[][] {
  const groups: PageToken[][] = []
  let joinsNext = false
  for (const token of tokens) {
    const attaches = attachment(token.text)
    const last = groups.at(-1)
    if (last && (attaches === 'previous' || joinsNext)) last.push(token)
    else groups.push([token])
    joinsNext = attaches === 'next'
  }
  return groups
}
