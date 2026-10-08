import { CheckIcon, GripVerticalIcon, PlayIcon, PointerIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { accent } from '@/components/dictionary/accent'
import { FrequencyBadges } from '@/components/dictionary/frequency'
import { HeadwordRuby } from '@/components/dictionary/headword-ruby'
import { RubyText } from '@/components/dictionary/ruby-text'
import { Badge } from '@/components/ui/badge'
import { frequencyPreview, furiganaPreview, listPreview, playerPreview } from '@/lib/home-previews'
import { cn } from '@/lib/utils'

export const previewPanel = 'rounded-lg bg-background ring-1 ring-foreground/10'

const raised = 'shadow-[0_14px_30px_-18px_rgb(0_0_0/0.3)]'

function CaptionCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(previewPanel, 'px-3 py-2.5', className)}>{children}</div>
}

const english = 'text-[0.8125rem] text-muted-foreground'

export function PlayerPreview() {
  const { earlier, current, open } = playerPreview
  return (
    <div aria-hidden="true" className="grid w-full max-w-160 items-center gap-3.5 md:grid-cols-2">
      <div className="relative grid aspect-video place-items-center overflow-hidden rounded-lg bg-neutral-800 shadow-[0_12px_28px_-14px_rgb(0_0_0/0.4)]">
        <span className="grid size-12 place-items-center rounded-full bg-white/15 text-white">
          <PlayIcon className="ml-0.5 size-5 fill-current" />
        </span>
        <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
          <span className="block h-full w-[28%] bg-red-600" />
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <CaptionCard className="opacity-55">
          <p lang="ja">{earlier.japanese}</p>
          <p className={english}>{earlier.english}</p>
        </CaptionCard>
        <CaptionCard className="relative ring-[1.5px] ring-foreground">
          <p lang="ja">
            {current.words.map(word =>
              word.linked ? (
                <span
                  key={word.text}
                  className={cn(
                    'border-b border-dashed border-foreground/35',
                    word.open && cn(accent, 'border-b-2 border-solid border-current')
                  )}
                >
                  {word.text}
                </span>
              ) : (
                word.text
              )
            )}
          </p>
          <p className={english}>{current.english}</p>
          <div
            className={cn(
              'dark absolute -top-9 right-2.5 flex max-w-[calc(100%-1.25rem)] items-baseline gap-2 overflow-hidden rounded-md bg-background px-2.5 py-1 text-xs whitespace-nowrap text-foreground',
              raised
            )}
          >
            <RubyText segments={open.ruby} className="text-[0.9375rem] font-medium" />
            <span className="truncate">{open.meaning}</span>
          </div>
        </CaptionCard>
      </div>
    </div>
  )
}

export function ListPreview() {
  return (
    <div aria-hidden="true" className={cn(previewPanel, raised, 'w-full max-w-68 overflow-hidden')}>
      <div className="flex items-baseline justify-between px-3.5 pt-3 pb-2">
        <span className="text-lg font-semibold tracking-tight">{listPreview.name}</span>
        <span className="text-xs text-muted-foreground">{listPreview.words.length} words</span>
      </div>
      <ul>
        {listPreview.words.map(word => (
          <li
            key={word.headword}
            className="flex items-center justify-between gap-2 border-t px-3.5 py-1"
          >
            <RubyText segments={word.ruby} className="text-[1.0625rem] leading-[1.9]" />
            {word.known ? (
              <Badge className="bg-green-500/15 text-green-700">
                <CheckIcon data-icon="inline-start" className="stroke-3" />
                Known
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FrequencyPreview() {
  const { enabled, available, word } = frequencyPreview
  return (
    <div aria-hidden="true" className="flex w-full max-w-68 flex-col gap-3">
      <div className={cn(previewPanel, 'overflow-hidden text-sm')}>
        <p className="px-3 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Enabled
        </p>
        {enabled.map((name, index) => (
          <p key={name} className="flex items-center gap-2.5 border-t px-3 py-2 font-medium">
            <span className="grid size-5 place-items-center rounded-full bg-muted text-[0.6875rem] tabular-nums">
              {index + 1}
            </span>
            {name}
            <GripVerticalIcon className="ml-auto size-4 text-muted-foreground" />
          </p>
        ))}
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Available: {available.join(', ')}
        </p>
      </div>
      <div
        className={cn(previewPanel, 'flex flex-wrap items-baseline gap-x-2 gap-y-1.5 px-3 py-2.5')}
      >
        <RubyText segments={word.ruby} className="text-[1.0625rem]" />
        <span className="text-[0.8125rem] text-muted-foreground">{word.meaning}</span>
        <div className="basis-full">
          <FrequencyBadges frequency={word.chips} />
        </div>
      </div>
    </div>
  )
}

export function FuriganaPreview() {
  return (
    <div className="flex flex-col items-center gap-3">
      <HeadwordRuby
        segments={furiganaPreview.segments}
        initiallySelected={furiganaPreview.highlighted}
        className="text-[2.75rem] leading-[1.6] font-medium tracking-wide"
      />
      <p className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
        <PointerIcon aria-hidden="true" className="size-3.5" />
        Tap a kanji to try it
      </p>
    </div>
  )
}
