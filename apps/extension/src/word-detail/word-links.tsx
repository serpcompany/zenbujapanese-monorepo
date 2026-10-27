import { fill } from '@zenbu/dictionary-core/detail/template'
import {
  type RenderWordLink,
  type WordLinkTarget,
  wordLinkKey
} from '@zenbu/ui/dictionary/word-link'
import { useMemo } from 'react'
import type { PanelPage } from '../side-panel/route'
import { wordDetailLabels } from './labels'
import { answered, type WordLookups } from './lookups'
import { notify } from './notice'

type Open = (page: PanelPage) => void
type Spelling = Extract<WordLinkTarget, { headword: string }>

function pageFor(target: Exclude<WordLinkTarget, Spelling>): PanelPage {
  if ('kanji' in target) return { page: 'kanji', character: target.kanji }
  if ('entSeqs' in target) {
    return { page: 'word', entSeq: target.entSeqs[0] as number, entries: target.entSeqs }
  }
  return { page: 'word', entSeq: target.entSeq }
}

async function openSpelling(
  { headword, reading }: Spelling,
  resolveWord: WordLookups['resolveWord'],
  open: Open
) {
  const answer = await answered(resolveWord(headword, reading))
  if (answer === null) notify(wordDetailLabels.lookup.failed)
  else if (answer.entSeq === null) {
    notify(fill(wordDetailLabels.lookup.spellingNotFound, { headword }))
  } else open({ page: 'word', entSeq: answer.entSeq })
}

export function useWordLinks(open: Open, resolveWord: WordLookups['resolveWord']): RenderWordLink {
  return useMemo(() => {
    const follow = (target: WordLinkTarget) => {
      if ('headword' in target) void openSpelling(target, resolveWord, open)
      else open(pageFor(target))
    }
    return ({ target, className, children, ...attributes }) => (
      <button
        type="button"
        className={`cursor-pointer text-left ${className ?? ''}`}
        data-opens={wordLinkKey(target)}
        onClick={() => follow(target)}
        {...attributes}
      >
        {children}
      </button>
    )
  }, [open, resolveWord])
}
