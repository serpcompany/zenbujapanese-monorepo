import type { ExampleToken } from '@zenbu/dictionary-core/detail/examples'
import type { ReactElement, ReactNode } from 'react'

export type WordLinkTarget =
  | NonNullable<ExampleToken['link']>
  | { kanji: string }
  | { headword: string; reading: string }

interface WordLinkProps {
  target: WordLinkTarget
  className?: string
  title?: string
  lang?: string
  'aria-label'?: string
  children?: ReactNode
}

export type RenderWordLink = (props: WordLinkProps) => ReactElement | null

export function wordLinkKey(target: WordLinkTarget): string {
  if ('kanji' in target) return `kanji:${target.kanji}`
  if ('entSeqs' in target) return `search:${target.query}`
  if ('headword' in target) return `spelling:${target.headword}|${target.reading}`
  return `word:${target.entSeq}`
}
