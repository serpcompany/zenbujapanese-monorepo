import {
  BatteryFullIcon,
  EllipsisIcon,
  PlayIcon,
  RepeatIcon,
  SignalIcon,
  SkipBackIcon,
  SkipForwardIcon,
  WifiIcon
} from 'lucide-react'
import { RubyText } from '@/components/dictionary/ruby-text'
import { playerPreview } from '@/lib/home-previews'
import { cn } from '@/lib/utils'

const { time, known, previous, caption, open } = playerPreview

const captionCard = 'relative rounded-[0.8em] px-[0.8em] pt-[0.6em] pb-[0.65em]'

function CaptionTime({ time }: { time: string }) {
  return (
    <span className="absolute top-[0.55em] right-[0.8em] text-[0.65em] text-muted-foreground tabular-nums">
      {time}
    </span>
  )
}

function StatusBar() {
  return (
    <div className="flex h-[3.3em] shrink-0 items-center justify-between px-[2.2em] pt-[0.5em] font-semibold">
      09:41
      <span className="flex items-center gap-[0.3em] [&_svg]:size-[1.1em]">
        <SignalIcon />
        <WifiIcon />
        <BatteryFullIcon />
      </span>
    </div>
  )
}

function Controls() {
  return (
    <div className="shrink-0 border-b bg-muted">
      <span className="block h-[0.22em] bg-border">
        <span className="block h-full w-[22%] bg-red-600" />
      </span>
      <div className="flex items-center gap-[0.8em] px-[1.1em] py-[0.6em] text-[0.8em] text-muted-foreground [&_svg]:size-[1.3em]">
        <span className="tabular-nums">
          {time.elapsed} / {time.total}
        </span>
        <span className="mx-auto flex items-center gap-[1.2em] text-foreground [&_svg]:fill-current">
          <SkipBackIcon />
          <PlayIcon />
          <SkipForwardIcon />
        </span>
        <span className="rounded-full bg-background px-[0.55em] text-foreground">1×</span>
        <RepeatIcon className="text-foreground" />
      </div>
    </div>
  )
}

function Captions() {
  return (
    <div className="flex flex-col gap-[0.5em] p-[0.9em]">
      <div className={cn(captionCard, 'bg-muted opacity-60')}>
        <CaptionTime time={previous.time} />
        <p lang="ja" className="text-[1.1em]">
          {previous.text}
        </p>
        <p className="text-[0.8em] text-muted-foreground">{previous.english}</p>
      </div>
      <div
        className={cn(
          captionCard,
          'bg-blue-600/5 ring-[0.12em] ring-blue-600 dark:bg-blue-400/10 dark:ring-blue-400'
        )}
      >
        <CaptionTime time={caption.time} />
        <p lang="ja" className="text-[1.1em]">
          {caption.words.map(word => (
            <span
              key={word}
              className={cn(
                'mx-[0.04em] border-b-[0.08em] border-foreground/35',
                word === open.headword &&
                  'rounded-t-[0.15em] border-blue-600 bg-blue-600/15 dark:border-blue-400'
              )}
            >
              {word}
            </span>
          ))}
          {caption.end}
        </p>
        <p className="text-[0.8em] text-muted-foreground">{caption.english}</p>
      </div>
    </div>
  )
}

function WordSheet() {
  return (
    <div className="absolute inset-x-0 top-[63.5%] bottom-0 flex flex-col gap-[0.55em] rounded-t-[1.8em] bg-muted px-[0.9em] pt-[0.55em] shadow-[0_-0.3em_1.6em_rgb(0_0_0/0.14)]">
      <span className="h-[0.3em] w-[2.6em] self-center rounded-full bg-foreground/20" />
      <div className="flex flex-col gap-[0.3em] rounded-[1em] bg-background px-[0.9em] pt-[0.4em] pb-[0.75em]">
        <div className="flex items-end justify-between gap-[0.5em] border-b pb-[0.4em]">
          <RubyText segments={open.ruby} className="text-[1.9em] leading-normal font-medium" />
          <span className="pb-[0.5em] text-[0.8em] text-muted-foreground">{open.partOfSpeech}</span>
        </div>
        <p className="text-[0.68em] font-semibold tracking-wider text-muted-foreground uppercase">
          Meaning
        </p>
        <ol className="flex list-decimal flex-col gap-[0.1em] pl-[1.3em] text-[0.9em]">
          {open.meanings.map(meaning => (
            <li key={meaning}>{meaning}</li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export function PlayerPreview() {
  return (
    <div
      aria-hidden="true"
      className="drawing @container relative aspect-[1206/2622] w-full overflow-hidden rounded-[13.7%/6.3%] bg-background shadow-[0_2px_4px_rgb(0_0_0/0.06),0_24px_48px_-18px_rgb(0_0_0/0.3)] ring-1 ring-foreground/10"
    >
      <div className="absolute inset-0 flex flex-col text-[4cqi] leading-[1.35]">
        <StatusBar />
        <div className="relative flex h-[3em] shrink-0 items-center justify-center font-semibold">
          Player
          <span className="absolute right-[1em] grid size-[2.3em] place-items-center rounded-full bg-muted">
            <EllipsisIcon className="size-[1.1em]" />
          </span>
        </div>
        <div className="grid aspect-video shrink-0 place-items-center bg-neutral-900">
          <span className="grid size-[3em] place-items-center rounded-full bg-white/15 text-white">
            <PlayIcon className="ml-[0.1em] size-[1.2em] fill-current" />
          </span>
        </div>
        <Controls />
        <p className="shrink-0 border-b px-[1.4em] py-[0.6em] text-[0.8em] text-muted-foreground">
          <span className="mr-[0.3em] font-semibold text-yellow-600 dark:text-yellow-400">
            {Math.round((known.words / known.of) * 100)}%
          </span>
          {known.words} of {known.of} words known
        </p>
        <Captions />
        <WordSheet />
      </div>
    </div>
  )
}
