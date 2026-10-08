import { PlayIcon } from 'lucide-react'
import { previewPanel, raisedPreview } from '@/components/home/home-styles'
import { WordPreview } from '@/components/home/word-preview'
import { playerPreview } from '@/lib/home-previews'
import { cn } from '@/lib/utils'

export function PlayerPreview() {
  const { caption, open } = playerPreview
  return (
    <div aria-hidden="true" className="flex w-full max-w-80 flex-col gap-2.5">
      <div className="relative grid aspect-video place-items-center overflow-hidden rounded-lg bg-neutral-900 shadow-[0_12px_28px_-14px_rgb(0_0_0/0.4)] ring-1 ring-foreground/10">
        <span className="grid size-12 place-items-center rounded-full bg-white/15 text-white">
          <PlayIcon className="ml-0.5 size-5 fill-current" />
        </span>
        <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
          <span className="block h-full w-[28%] bg-red-600" />
        </span>
      </div>
      <div
        className={cn(
          previewPanel,
          'bg-blue-600/5 px-3 py-2.5 ring-[1.5px] ring-blue-600 dark:bg-blue-400/10 dark:ring-blue-400'
        )}
      >
        <p lang="ja">
          {caption.words.map(word => (
            <span key={word} className="mx-px border-b-[1.5px] border-foreground/35">
              {word}
            </span>
          ))}
          {caption.end}
        </p>
        <p className="text-[0.8125rem] text-muted-foreground">{caption.english}</p>
      </div>
      <WordPreview
        word={open}
        className={cn(
          raisedPreview,
          'rounded-b-none pt-2 before:mx-auto before:mb-1 before:h-1 before:w-8 before:rounded-full before:bg-foreground/15'
        )}
      />
    </div>
  )
}
