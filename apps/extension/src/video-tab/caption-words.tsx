import { RomajiLine } from '@zenbu/ui/dictionary/reading-aid-lines'
import { RubyText } from '@zenbu/ui/dictionary/ruby-text'
import type { MouseEvent } from 'react'
import type { Gloss } from '../page-lookup/annotate'
import { type PageToken, wordGroups } from '../page-lookup/words'
import type { Settings } from '../shared/settings'
import { useFound, useGlosses } from '../translate/source-words'
import { ReadingAids } from '../word-detail/reading-aids'
import { wordPopupLabels } from '../word-popup/labels'
import type { VideoTabServices } from './services'
import { type CaptionGlosses, type KnownWords, useKnown } from './word-marks'

type OpenWord = (token: PageToken, from: HTMLElement) => void

const lineClass = 'flex flex-wrap items-baseline text-base leading-[1.35] text-foreground'

const wordClass =
  'group/word inline-flex cursor-pointer flex-col items-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

const textClass =
  'relative inline-flex items-end rounded-sm pb-1 after:absolute after:inset-x-0.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground/25 group-hover/word:bg-(--player-hover) group-data-known/word:after:opacity-0 group-data-selected/word:text-blue-600 group-data-selected/word:after:bg-blue-600 group-data-selected/word:after:opacity-100 dark:after:bg-foreground/30 dark:group-data-selected/word:text-blue-400 dark:group-data-selected/word:after:bg-blue-400'

const meaningClass = 'mt-0.5 text-xs leading-[1.3] text-blue-600 dark:text-blue-400'

function captionGroups(tokens: readonly PageToken[], functionWords: ReadonlySet<string>) {
  const groups: PageToken[][] = []
  for (const group of wordGroups(tokens)) {
    const first = group[0].linked
    const last = groups.at(-1)
    if (last && first !== null && functionWords.has(first)) last.push(...group)
    else groups.push(group)
  }
  return groups
}

type WordProps = {
  token: PageToken
  gloss: Gloss | null
  known: boolean
  plain: boolean
  selected: boolean
  open: OpenWord
}

function Word({ token, gloss, known, plain, selected, open }: WordProps) {
  if (token.ids.length === 0) return <RubyText segments={token.ruby} className="pb-1" />
  const segments = plain ? token.ruby.map(({ text }) => ({ text })) : token.ruby
  return (
    <button
      type="button"
      data-word={token.text}
      data-start={token.start}
      data-known={known || undefined}
      data-selected={selected || undefined}
      className={gloss ? `${wordClass} px-[3px]` : wordClass}
      onClick={(event: MouseEvent<HTMLButtonElement>) => open(token, event.currentTarget)}
    >
      <span className={textClass}>
        <RubyText segments={segments} />
      </span>
      {gloss ? (
        <span
          data-aid="meaning"
          lang={wordPopupLabels.lang}
          title={gloss.full}
          className={meaningClass}
        >
          <span aria-hidden="true">{gloss.short}</span>
          <span className="sr-only">{gloss.full}</span>
        </span>
      ) : null}
    </button>
  )
}

type CaptionWordsProps = {
  source: string
  settings: Settings | null
  services: VideoTabServices
  glosses: CaptionGlosses
  known: KnownWords
  selected: number | null
  open: OpenWord
}

export function CaptionWords({
  source,
  settings,
  services,
  glosses,
  known,
  selected,
  open
}: CaptionWordsProps) {
  const found = useFound(source, services)
  const meanings = settings?.['readingAids.wordMeanings'] === true
  const shown = useGlosses(found, meanings, services, glosses)
  const isKnown = useKnown(found, known)
  if (!found || !settings) {
    return (
      <p lang="ja" data-source className={lineClass}>
        {source}
      </p>
    )
  }
  const plainKnown = settings['readingAids.furiganaHiddenOnKnownWords']
  return (
    <ReadingAids settings={settings} className="flex flex-col">
      <p lang="ja" data-source className={`${lineClass} ${meanings ? 'gap-y-2.25' : 'gap-y-0.75'}`}>
        {captionGroups(found.tokens, glosses.functionWords).map(group => (
          <span
            key={group[0].start}
            data-caption-group
            className="inline-flex items-baseline whitespace-nowrap"
          >
            {group.map(token => {
              const knows = isKnown(token.linked)
              const chosen = selected === token.start
              const gloss =
                meanings && !knows && token.linked ? (shown.get(token.linked) ?? null) : null
              return (
                <Word
                  key={token.start}
                  token={token}
                  gloss={gloss}
                  known={knows}
                  plain={plainKnown && knows && !chosen}
                  selected={chosen}
                  open={open}
                />
              )
            })}
          </span>
        ))}
      </p>
      <RomajiLine romaji={found.romaji} className="mt-1 text-sm leading-[1.4]" />
    </ReadingAids>
  )
}
